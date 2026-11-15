package deployer;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.InputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.URLDecoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Executors;

/**
 * The deployer's website. Everything goes through one port, so one public link covers it all:
 *
 *   /                          dashboard           /branch?b=   branch page      /code?b=&path=   code viewer
 *   /_deployer/...             dashboard files, JSON API and file previews
 *   /site/<branch>/<site>/...  a branch's running website, passed through to its local port
 *
 * Branch sites ask for absolute paths like /api/missions. Those are sent to the site the request
 * came from (by its Referer, or a cookie set when the site was opened).
 */
final class Dashboard {

    private static final int MAX_FILE_BYTES = 1_000_000;
    private static final Map<String, byte[]> ASSETS = new HashMap<>();
    private static final String SITE_COOKIE = "pp_site";
    private static final Set<String> HOP_HEADERS = Set.of("connection", "keep-alive", "transfer-encoding", "te",
            "trailer", "upgrade", "content-length", "host", "proxy-authorization", "proxy-authenticate", "date");
    private static final HttpClient CLIENT = HttpClient.newBuilder()
            .followRedirects(HttpClient.Redirect.NEVER)
            .connectTimeout(Duration.ofSeconds(3))
            .build();

    /**
     * Engine data panel. The deployer adds it to the Story game page (web/story/rover.html) as the
     * page passes through, so the game's own files are never changed. The panel reads live rover
     * stats from the engine through {@link #ENGINE_API}.
     */
    static final String ENGINE_API = "/_deployer/engine/";
    private static final Set<String> ENGINE_HUD_BRANCHES = Set.of("story");
    /** Where the engine numbers come from, best first: Aku's engine branch, then the page's own branch, then main. */
    private static final List<String> ENGINE_SOURCES = List.of("engine", "main");
    private static final String ENGINE_HUD_TAGS =
            "<link rel=\"stylesheet\" href=\"/_deployer/engine-hud.css\">"
            + "<script src=\"/_deployer/engine-hud.js\" defer></script>";

    private static volatile long lastRefresh = 0;

    private Dashboard() {}

    static void start(Deployer d, int port, String password) throws IOException {
        for (String name : List.of("index.html", "branch.html", "code.html", "deployer.css", "deployer.js",
                "engine-hud.css", "engine-hud.js")) {
            try (InputStream in = Dashboard.class.getResourceAsStream("/web/" + name)) {
                if (in == null) throw new IOException("Missing dashboard file web/" + name);
                ASSETS.put(name, in.readAllBytes());
            }
        }

        HttpServer server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), port), 0);
        server.setExecutor(Executors.newFixedThreadPool(16));
        server.createContext("/", ex -> {
            try {
                if (password != null && !authorized(ex, password)) {
                    ex.getResponseHeaders().set("WWW-Authenticate", "Basic realm=\"Payload Pets deployer\", charset=\"UTF-8\"");
                    text(ex, 401, "Team password needed. Ask your team for it.");
                    return;
                }
                route(d, ex);
            } catch (Exception e) {
                try {
                    text(ex, 500, "Deployer error: " + e.getMessage());
                } catch (IOException ignored) {
                    // client went away
                }
            } finally {
                ex.close();
            }
        });
        server.start();
    }

    private static boolean authorized(HttpExchange ex, String password) {
        String h = ex.getRequestHeaders().getFirst("Authorization");
        if (h == null || !h.startsWith("Basic ")) return false;
        try {
            String decoded = new String(Base64.getDecoder().decode(h.substring(6).trim()), StandardCharsets.UTF_8);
            String given = decoded.substring(decoded.indexOf(':') + 1); // any username is fine
            return MessageDigest.isEqual(given.getBytes(StandardCharsets.UTF_8), password.getBytes(StandardCharsets.UTF_8));
        } catch (IllegalArgumentException e) {
            return false;
        }
    }

    // ------------------------------------------------------------------ routing

    private static void route(Deployer d, HttpExchange ex) throws IOException {
        String path = ex.getRequestURI().getPath();
        switch (path) {
            case "/", "/index.html" -> { page(ex, "index.html"); return; }
            case "/branch" -> { page(ex, "branch.html"); return; }
            case "/code" -> { page(ex, "code.html"); return; }
            case "/_deployer/deployer.css" -> { page(ex, "deployer.css"); return; }
            case "/_deployer/deployer.js" -> { page(ex, "deployer.js"); return; }
            case "/_deployer/engine-hud.css" -> { page(ex, "engine-hud.css"); return; }
            case "/_deployer/engine-hud.js" -> { page(ex, "engine-hud.js"); return; }
            case "/_deployer/api/status" -> { json(ex, 200, d.statusJson()); return; }
            case "/_deployer/api/refresh" -> { refresh(d, ex); return; }
            case "/_deployer/api/branch" -> { branch(d, ex); return; }
            case "/_deployer/api/file" -> { file(d, ex); return; }
            default -> { }
        }
        if (path.startsWith("/_deployer/preview/")) {
            preview(d, ex);
            return;
        }
        if (path.startsWith(ENGINE_API)) {
            engineApi(d, ex);
            return;
        }
        if (path.startsWith("/site/")) {
            sitePrefixed(d, ex);
            return;
        }
        // An absolute path asked for by a branch site (e.g. /api/missions): send it to that site.
        String[] target = siteFromReferer(ex);
        if (target == null) target = siteFromCookie(ex);
        BranchState.App app = target == null ? null : d.app(target[0], target[1]);
        if (app == null) {
            text(ex, 404, "Not found");
            return;
        }
        proxy(ex, app, ex.getRequestURI().getRawPath(), target);
    }

    private static void page(HttpExchange ex, String name) throws IOException {
        send(ex, 200, contentType(name), ASSETS.get(name));
    }

    // ------------------------------------------------------------------ proxy to branch sites

    /** /site/<branch>/<site>/<rest> -> http://localhost:<port>/<rest> */
    private static void sitePrefixed(Deployer d, HttpExchange ex) throws IOException {
        String raw = ex.getRequestURI().getRawPath();
        String[] parts = raw.substring("/site/".length()).split("/", 3);
        if (parts.length < 2) {
            text(ex, 404, "Not found");
            return;
        }
        String branch = dec(parts[0]), site = dec(parts[1]);
        if (parts.length == 2) { // /site/b/a -> /site/b/a/ so relative links work
            ex.getResponseHeaders().set("Location", raw + "/");
            send(ex, 302, "text/plain; charset=utf-8", new byte[0]);
            return;
        }
        BranchState.App app = d.app(branch, site);
        if (app == null) {
            text(ex, 404, "Site " + site + " on branch " + branch + " is not running. Check its branch page.");
            return;
        }
        String[] target = {branch, site};
        ex.getResponseHeaders().add("Set-Cookie", SITE_COOKIE + "=" + Builder.enc(branch) + "/" + Builder.enc(site)
                + "; Path=/; SameSite=Lax; HttpOnly");
        proxy(ex, app, "/" + parts[2], target);
    }

    private static String[] siteFromReferer(HttpExchange ex) {
        String ref = ex.getRequestHeaders().getFirst("Referer");
        if (ref == null) return null;
        try {
            String p = URI.create(ref).getRawPath();
            if (p == null || !p.startsWith("/site/")) return null;
            String[] parts = p.substring(6).split("/", 3);
            return parts.length >= 2 ? new String[] {dec(parts[0]), dec(parts[1])} : null;
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private static String[] siteFromCookie(HttpExchange ex) {
        List<String> cookies = ex.getRequestHeaders().get("Cookie");
        if (cookies == null) return null;
        for (String header : cookies) {
            for (String c : header.split(";")) {
                String t = c.trim();
                if (t.startsWith(SITE_COOKIE + "=")) {
                    String[] parts = t.substring(SITE_COOKIE.length() + 1).split("/", 2);
                    if (parts.length == 2) return new String[] {dec(parts[0]), dec(parts[1])};
                }
            }
        }
        return null;
    }

    private static void proxy(HttpExchange ex, BranchState.App app, String rawPath, String[] target) throws IOException {
        String query = ex.getRequestURI().getRawQuery();
        URI uri = URI.create("http://127.0.0.1:" + app.port + rawPath + (query == null ? "" : "?" + query));
        byte[] body;
        try (InputStream in = ex.getRequestBody()) {
            body = in.readAllBytes();
        }
        HttpRequest.Builder rb = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(30))
                .method(ex.getRequestMethod(), body.length == 0
                        ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofByteArray(body));
        for (String h : List.of("Content-Type", "Accept", "Accept-Language", "If-None-Match", "If-Modified-Since")) {
            String v = ex.getRequestHeaders().getFirst(h);
            if (v != null) rb.header(h, v);
        }
        HttpResponse<byte[]> res;
        try {
            res = CLIENT.send(rb.build(), HttpResponse.BodyHandlers.ofByteArray());
        } catch (IOException e) {
            text(ex, 502, "The " + target[1] + " site on branch " + target[0] + " is not answering. It may be restarting.");
            return;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            text(ex, 503, "Interrupted");
            return;
        }
        res.headers().map().forEach((k, vs) -> {
            String key = k.toLowerCase(Locale.ROOT);
            if (HOP_HEADERS.contains(key) || key.startsWith(":")) return;
            for (String v : vs) {
                if (key.equals("location") && v.startsWith("/") && !v.startsWith("//")) {
                    v = "/site/" + Builder.enc(target[0]) + "/" + Builder.enc(target[1]) + v;
                }
                ex.getResponseHeaders().add(k, v);
            }
        });
        byte[] out = res.body();
        int code = res.statusCode();
        if (code == 200 && wantsEngineHud(target[0], res)) {
            out = withEngineHud(out);
            ex.getResponseHeaders().remove("ETag");
            ex.getResponseHeaders().remove("Last-Modified");
        }
        boolean noBody = code == 204 || code == 304 || ex.getRequestMethod().equals("HEAD");
        ex.sendResponseHeaders(code, noBody ? -1 : out.length);
        if (!noBody) {
            try (var os = ex.getResponseBody()) {
                os.write(out);
            }
        }
    }

    // ------------------------------------------------------------------ engine data panel

    /** Only the Story branch's 3D game page (the one that loads rover.js) gets the panel. */
    private static boolean wantsEngineHud(String branch, HttpResponse<byte[]> res) {
        if (ENGINE_HUD_BRANCHES.stream().noneMatch(b -> b.equalsIgnoreCase(branch))) return false;
        String type = res.headers().firstValue("Content-Type").orElse("");
        if (!type.startsWith("text/html")) return false;
        String html = new String(res.body(), StandardCharsets.UTF_8);
        return html.contains("rover.js") && html.contains("</body>") && !html.contains("engine-hud.js");
    }

    private static byte[] withEngineHud(byte[] body) {
        String html = new String(body, StandardCharsets.UTF_8);
        int at = html.lastIndexOf("</body>");
        return (html.substring(0, at) + ENGINE_HUD_TAGS + "\n" + html.substring(at)).getBytes(StandardCharsets.UTF_8);
    }

    /**
     * /_deployer/engine/api/engine/... -> the engine server's /api/engine/... Answers with the header
     * X-Engine-Source (e.g. "engine@90c79ec") so the panel can show whose engine it is reading.
     */
    private static void engineApi(Deployer d, HttpExchange ex) throws IOException {
        String rest = ex.getRequestURI().getRawPath().substring(ENGINE_API.length() - 1);
        if (!rest.startsWith("/api/engine/") || !ex.getRequestMethod().equals("GET")) {
            json(ex, 404, Json.obj("error", Json.q("Only GET /api/engine/... is passed to the engine")));
            return;
        }
        List<String> order = new ArrayList<>(ENGINE_SOURCES);
        String[] from = siteFromReferer(ex);
        if (from == null) from = siteFromCookie(ex);
        if (from != null) order.add(1, from[0]);
        for (String branch : order) {
            BranchState.App app = d.app(branch, "Engine");
            if (app == null) continue;
            BranchState st = d.branch(branch);
            String sha;
            synchronized (st) {
                sha = st.sha == null ? "" : "@" + st.sha.substring(0, Math.min(7, st.sha.length()));
            }
            ex.getResponseHeaders().set("X-Engine-Source", branch + sha);
            ex.getResponseHeaders().set("Cache-Control", "no-store");
            proxy(ex, app, rest, new String[] {branch, "Engine"});
            return;
        }
        json(ex, 503, Json.obj("error", Json.q("No engine is running yet. Check the engine branch on the dashboard.")));
    }

    // ------------------------------------------------------------------ dashboard API

    private static void refresh(Deployer d, HttpExchange ex) throws IOException {
        if (!ex.getRequestMethod().equals("POST")) {
            json(ex, 405, Json.obj("error", Json.q("Use POST")));
            return;
        }
        long now = System.currentTimeMillis();
        if (now - lastRefresh > 10_000) { // at most one forced check every 10 s
            lastRefresh = now;
            d.requestRefresh();
        }
        json(ex, 200, Json.obj("ok", "true"));
    }

    private static void branch(Deployer d, HttpExchange ex) throws IOException {
        BranchState st = d.branch(query(ex).getOrDefault("b", ""));
        if (st == null) {
            json(ex, 404, Json.obj("error", Json.q("No such branch on GitHub")));
            return;
        }
        String sha;
        String log;
        List<String[]> appLogs = new ArrayList<>();
        synchronized (st) {
            sha = st.sha;
            log = st.buildLog.toString();
            for (BranchState.App a : st.apps) appLogs.add(new String[] {a.name(), a.logFile == null ? null : a.logFile.toString()});
        }
        List<String> appLogJson = new ArrayList<>();
        for (String[] a : appLogs) {
            String text = a[1] == null ? "" : Builder.tail(java.nio.file.Path.of(a[1]), 200);
            appLogJson.add(Json.obj("name", Json.q(a[0]), "log", Json.q(text)));
        }
        Git git = d.git();
        json(ex, 200, Json.obj(
                "branch", st.toJson(),
                "commits", Json.array(sha == null ? List.<Git.Commit>of() : git.log(sha, 25), Git.Commit::toJson),
                "files", Json.array(sha == null ? List.<String>of() : git.files(sha), Json::q),
                "buildLog", Json.q(log),
                "appLogs", "[" + String.join(",", appLogJson) + "]"));
    }

    private static void file(Deployer d, HttpExchange ex) throws IOException {
        Map<String, String> q = query(ex);
        BranchState st = d.branch(q.getOrDefault("b", ""));
        String path = q.getOrDefault("path", "");
        byte[] bytes = st == null ? null : fileAt(d, st, path);
        if (bytes == null) {
            json(ex, 404, Json.obj("error", Json.q("File not found on this branch")));
            return;
        }
        boolean binary = isBinary(bytes);
        boolean truncated = bytes.length > MAX_FILE_BYTES;
        String text = binary ? "" : new String(bytes, 0, Math.min(bytes.length, MAX_FILE_BYTES), StandardCharsets.UTF_8);
        json(ex, 200, Json.obj("path", Json.q(path), "size", Integer.toString(bytes.length),
                "binary", Json.b(binary), "truncated", Json.b(truncated), "text", Json.q(text)));
    }

    /** /_deployer/preview/<branch>/<path>: a file straight from git, so pages without a server still open. */
    private static void preview(Deployer d, HttpExchange ex) throws IOException {
        String rest = ex.getRequestURI().getRawPath().substring("/_deployer/preview/".length());
        int slash = rest.indexOf('/');
        if (slash < 0) {
            text(ex, 404, "Not found");
            return;
        }
        String branch = dec(rest.substring(0, slash));
        String path = dec(rest.substring(slash + 1));
        BranchState st = d.branch(branch);
        byte[] bytes = st == null ? null : fileAt(d, st, path);
        if (bytes == null) {
            text(ex, 404, "Not found on branch " + branch + ": " + path);
            return;
        }
        send(ex, 200, contentType(path), bytes);
    }

    /** A file at the branch's latest commit, only if git lists it (no reading outside the repo). */
    private static byte[] fileAt(Deployer d, BranchState st, String path) {
        String sha;
        synchronized (st) {
            sha = st.sha;
        }
        if (sha == null || path.isEmpty() || !d.git().files(sha).contains(path)) return null;
        return d.git().show(sha, path);
    }

    private static boolean isBinary(byte[] b) {
        for (int i = 0; i < Math.min(b.length, 8000); i++) if (b[i] == 0) return true;
        return false;
    }

    // ------------------------------------------------------------------ helpers

    static String contentType(String name) {
        String n = name.toLowerCase(Locale.ROOT);
        if (n.endsWith(".html")) return "text/html; charset=utf-8";
        if (n.endsWith(".css")) return "text/css; charset=utf-8";
        if (n.endsWith(".js") || n.endsWith(".mjs")) return "text/javascript; charset=utf-8";
        if (n.endsWith(".json")) return "application/json; charset=utf-8";
        if (n.endsWith(".svg")) return "image/svg+xml";
        if (n.endsWith(".png")) return "image/png";
        if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
        if (n.endsWith(".gif")) return "image/gif";
        if (n.endsWith(".md") || n.endsWith(".txt") || n.endsWith(".java") || n.endsWith(".sh")) return "text/plain; charset=utf-8";
        return "application/octet-stream";
    }

    private static String dec(String s) {
        return URLDecoder.decode(s, StandardCharsets.UTF_8);
    }

    private static Map<String, String> query(HttpExchange ex) {
        Map<String, String> out = new HashMap<>();
        String raw = ex.getRequestURI().getRawQuery();
        if (raw == null) return out;
        for (String pair : raw.split("&")) {
            int i = pair.indexOf('=');
            if (i < 0) continue;
            out.put(dec(pair.substring(0, i)), dec(pair.substring(i + 1)));
        }
        return out;
    }

    private static void json(HttpExchange ex, int code, String body) throws IOException {
        send(ex, code, "application/json; charset=utf-8", body.getBytes(StandardCharsets.UTF_8));
    }

    private static void text(HttpExchange ex, int code, String body) throws IOException {
        send(ex, code, "text/plain; charset=utf-8", body.getBytes(StandardCharsets.UTF_8));
    }

    private static void send(HttpExchange ex, int code, String type, byte[] body) throws IOException {
        ex.getResponseHeaders().set("Content-Type", type);
        ex.getResponseHeaders().set("Cache-Control", "no-store");
        ex.getResponseHeaders().set("X-Content-Type-Options", "nosniff");
        ex.sendResponseHeaders(code, body.length == 0 ? -1 : body.length);
        if (body.length > 0) {
            try (var os = ex.getResponseBody()) {
                os.write(body);
            }
        }
    }
}
