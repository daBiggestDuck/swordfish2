package engine;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.net.BindException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;

/**
 * Local web server for the engine. JDK only, no libraries, no internet: it listens on
 * this computer only (localhost) and never calls out to any website.
 *
 *   GET /api/engine/health                        {ok:true} liveness check for the v0 shell
 *   GET /api/engine/sites                         landing sites
 *   GET /api/engine/pets                          payload pets
 *   GET /api/engine/facts                         real facts, sources and milestones
 *   GET /api/engine/new?site=&pet=&name=&tipped=  start a game -> {id, state}
 *   GET /api/engine/state?id=                     current state
 *   GET /api/engine/tick?id=&hours=               advance time -> {events, state}
 *   GET /api/engine/act?id=&action=               press a button -> {result, state}
 *   everything else                               static files from ./web (engine.html at /)
 */
public class EngineServer {

    private static final int MAX_GAMES = 200;
    private static final double MAX_TICK_HOURS = 48;
    private static final Path ROOT = Path.of("web").toAbsolutePath().normalize();
    private static final SecureRandom RANDOM = new SecureRandom();

    /** Open games, oldest dropped first. */
    private static final Map<String, Game> GAMES = new LinkedHashMap<>(16, 0.75f, true) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<String, Game> eldest) {
            return size() > MAX_GAMES;
        }
    };

    public static void main(String[] args) throws IOException {
        int port = 8082;
        if (args.length > 0) {
            try {
                port = Integer.parseInt(args[0].trim());
            } catch (NumberFormatException e) {
                System.err.println("Port must be a number, got: " + args[0]);
                System.exit(2);
            }
        }
        HttpServer server;
        try {
            server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), port), 0);
        } catch (BindException e) {
            System.err.println("Port " + port + " is already in use. Another engine may already be running:"
                    + " open http://localhost:" + port + "/ or stop it, or pass a different port.");
            System.exit(1);
            return;
        }
        // A few threads so one slow request never freezes the clock for everyone else.
        server.setExecutor(Executors.newFixedThreadPool(4));

        route(server, "/api/engine/health", ex -> json(ex, 200, Json.obj("ok", Json.b(true))));
        route(server, "/api/engine/sites", ex -> json(ex, 200, Json.array(Sites.ALL, Site::toJson)));
        route(server, "/api/engine/pets", ex -> json(ex, 200, Json.array(Pet.ALL, Pet::toJson)));
        route(server, "/api/engine/facts", ex -> json(ex, 200, Json.obj(
                "facts", Json.array(Sources.FACTS, Sources.Fact::toJson),
                "sources", Json.array(Sources.ALL, Sources.Source::toJson),
                "milestones", Json.array(Rules.MILESTONES, Rules.Milestone::toJson))));

        route(server, "/api/engine/new", ex -> {
            Map<String, String> q = query(ex);
            Site site = Sites.byId(q.getOrDefault("site", "")).orElse(Sites.ALL.get(0));
            Pet pet = Pet.byId(q.getOrDefault("pet", "")).orElse(Pet.ALL.get(0));
            String name = q.getOrDefault("name", "");
            if (name.length() > 24) name = name.substring(0, 24);
            Game game = new Game(pet, site, name, "true".equals(q.get("tipped")));
            String id = newId();
            synchronized (GAMES) {
                GAMES.put(id, game);
            }
            json(ex, 200, Json.obj("id", Json.q(id), "state", game.toJson()));
        });

        route(server, "/api/engine/state", ex -> withGame(ex, (game, q) -> game.toJson()));

        route(server, "/api/engine/tick", ex -> withGame(ex, (game, q) -> {
            double hours;
            try {
                hours = Double.parseDouble(q.getOrDefault("hours", "1"));
            } catch (NumberFormatException e) {
                hours = 1;
            }
            if (!Double.isFinite(hours)) hours = 1;
            hours = Math.max(0, Math.min(MAX_TICK_HOURS, hours));
            List<Event> events = game.tick(hours);
            return Json.obj("events", Json.array(events, Event::toJson), "state", game.toJson());
        }));

        route(server, "/api/engine/act", ex -> withGame(ex, (game, q) -> {
            Game.Result r = game.act(q.getOrDefault("action", ""));
            return Json.obj("result", r.toJson(), "state", game.toJson());
        }));

        route(server, "/", EngineServer::serveStatic);
        server.start();
        System.out.println("Payload Pets engine: http://localhost:" + port + "/  (local only, Ctrl+C to stop)");
    }

    /**
     * Registers a handler that always answers: CORS preflight for the local v0 shell, and a JSON
     * 500 instead of a dropped connection if anything inside throws.
     */
    private static void route(HttpServer server, String path, HttpHandler handler) {
        server.createContext(path, ex -> {
            try {
                allowLocalOrigin(ex);
                if ("OPTIONS".equalsIgnoreCase(ex.getRequestMethod())) {
                    ex.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, OPTIONS");
                    ex.sendResponseHeaders(204, -1);
                    return;
                }
                handler.handle(ex);
            } catch (Exception e) {
                System.err.println("Engine request failed: " + ex.getRequestURI() + " -> " + e);
                try {
                    json(ex, 500, Json.obj("error", Json.q("Engine error: " + e.getClass().getSimpleName())));
                } catch (IOException | RuntimeException ignored) {
                    // headers may already be sent; nothing more we can do
                }
            } finally {
                ex.close();
            }
        });
    }

    /** Lets pages served from localhost / 127.0.0.1 on any port (the v0 shell on :8765) read our replies. */
    private static void allowLocalOrigin(HttpExchange ex) {
        String origin = ex.getRequestHeaders().getFirst("Origin");
        if (origin != null && origin.matches("http://(localhost|127\\.0\\.0\\.1)(:\\d{1,5})?")) {
            ex.getResponseHeaders().set("Access-Control-Allow-Origin", origin);
            ex.getResponseHeaders().set("Vary", "Origin");
        }
    }

    private interface GameHandler {
        String handle(Game game, Map<String, String> query);
    }

    private static void withGame(HttpExchange ex, GameHandler handler) throws IOException {
        Map<String, String> q = query(ex);
        Game game;
        synchronized (GAMES) {
            game = GAMES.get(q.getOrDefault("id", ""));
        }
        if (game == null) {
            json(ex, 404, Json.obj("error", Json.q("No game with that id. Start a new one.")));
            return;
        }
        String body;
        synchronized (game) {
            body = handler.handle(game, q);
        }
        json(ex, 200, body);
    }

    private static String newId() {
        byte[] b = new byte[9];
        RANDOM.nextBytes(b);
        StringBuilder sb = new StringBuilder();
        for (byte x : b) sb.append(String.format("%02x", x));
        return sb.toString();
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

    private static void serveStatic(HttpExchange ex) throws IOException {
        String path = ex.getRequestURI().getPath();
        if (path.equals("/")) path = "/engine.html";
        Path file = ROOT.resolve(path.substring(1)).normalize();
        if (!file.startsWith(ROOT) || !Files.isRegularFile(file)) {
            send(ex, 404, "text/plain; charset=utf-8", "Not found".getBytes(StandardCharsets.UTF_8));
            return;
        }
        String name = file.getFileName().toString();
        String type = name.endsWith(".html") ? "text/html; charset=utf-8"
                : name.endsWith(".css") ? "text/css; charset=utf-8"
                : name.endsWith(".js") ? "text/javascript; charset=utf-8"
                : name.endsWith(".mjs") ? "text/javascript; charset=utf-8"
                : name.endsWith(".json") ? "application/json; charset=utf-8"
                : name.endsWith(".svg") ? "image/svg+xml"
                : name.endsWith(".png") ? "image/png"
                : name.endsWith(".jpg") || name.endsWith(".jpeg") ? "image/jpeg"
                : name.endsWith(".ico") ? "image/x-icon"
                : "application/octet-stream";
        send(ex, 200, type, Files.readAllBytes(file));
    }

    private static void send(HttpExchange ex, int code, String type, byte[] body) throws IOException {
        ex.getResponseHeaders().set("Content-Type", type);
        ex.getResponseHeaders().set("Cache-Control", "no-store");
        ex.sendResponseHeaders(code, body.length);
        try (var os = ex.getResponseBody()) {
            os.write(body);
        }
    }
}
