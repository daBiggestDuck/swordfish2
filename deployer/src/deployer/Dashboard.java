package deployer;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.InputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.Executors;

/** The deployer's own website: dashboard, one page per branch, code viewer, and a JSON API. */
final class Dashboard {

    private static final int MAX_FILE_BYTES = 1_000_000;
    private static final Map<String, byte[]> ASSETS = new HashMap<>();

    private Dashboard() {}

    static void start(Deployer d, int port) throws IOException {
        // Load the dashboard's own pages into memory, so switching git branches can't break it.
        for (String name : List.of("index.html", "branch.html", "code.html", "deployer.css", "deployer.js")) {
            try (InputStream in = Dashboard.class.getResourceAsStream("/web/" + name)) {
                if (in == null) throw new IOException("Missing dashboard file web/" + name);
                ASSETS.put(name, in.readAllBytes());
            }
        }

        HttpServer server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), port), 0);
        server.setExecutor(Executors.newFixedThreadPool(8));

        server.createContext("/api/status", ex -> json(ex, 200, d.statusJson()));

        server.createContext("/api/refresh", ex -> {
            if (!ex.getRequestMethod().equals("POST")) {
                json(ex, 405, Json.obj("error", Json.q("Use POST")));
                return;
            }
            d.requestRefresh();
            json(ex, 200, Json.obj("ok", "true"));
        });

        server.createContext("/api/branch", ex -> {
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
        });

        server.createContext("/api/file", ex -> {
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
        });

        // /preview/<branch>/<path>: serve a file straight from git, so HTML pages without a server still open.
        server.createContext("/preview/", ex -> {
            String rest = ex.getRequestURI().getRawPath().substring("/preview/".length());
            int slash = rest.indexOf('/');
            if (slash < 0) {
                text(ex, 404, "Not found");
                return;
            }
            String branch = URLDecoder.decode(rest.substring(0, slash), StandardCharsets.UTF_8);
            String path = URLDecoder.decode(rest.substring(slash + 1), StandardCharsets.UTF_8);
            BranchState st = d.branch(branch);
            byte[] bytes = st == null ? null : fileAt(d, st, path);
            if (bytes == null) {
                text(ex, 404, "Not found on branch " + branch + ": " + path);
                return;
            }
            send(ex, 200, contentType(path), bytes);
        });

        server.createContext("/", ex -> {
            String p = ex.getRequestURI().getPath();
            String name = switch (p) {
                case "/", "/index.html" -> "index.html";
                case "/branch", "/branch.html" -> "branch.html";
                case "/code", "/code.html" -> "code.html";
                case "/deployer.css" -> "deployer.css";
                case "/deployer.js" -> "deployer.js";
                default -> null;
            };
            if (name == null) {
                text(ex, 404, "Not found");
                return;
            }
            send(ex, 200, contentType(name), ASSETS.get(name));
        });

        server.start();
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

    private static Map<String, String> query(HttpExchange ex) {
        Map<String, String> out = new HashMap<>();
        String raw = ex.getRequestURI().getRawQuery();
        if (raw == null) return out;
        for (String pair : raw.split("&")) {
            int i = pair.indexOf('=');
            if (i < 0) continue;
            out.put(URLDecoder.decode(pair.substring(0, i), StandardCharsets.UTF_8),
                    URLDecoder.decode(pair.substring(i + 1), StandardCharsets.UTF_8));
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
        ex.sendResponseHeaders(code, body.length);
        try (var os = ex.getResponseBody()) {
            os.write(body);
        }
    }
}
