package engine;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
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

/**
 * Local web server for the engine. JDK only, no libraries, no internet: it listens on
 * this computer only (localhost) and never calls out to any website.
 *
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
        int port = args.length > 0 ? Integer.parseInt(args[0]) : 8082;
        HttpServer server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), port), 0);

        server.createContext("/api/engine/sites", ex -> json(ex, 200, Json.array(Sites.ALL, Site::toJson)));
        server.createContext("/api/engine/pets", ex -> json(ex, 200, Json.array(Pet.ALL, Pet::toJson)));
        server.createContext("/api/engine/facts", ex -> json(ex, 200, Json.obj(
                "facts", Json.array(Sources.FACTS, Sources.Fact::toJson),
                "sources", Json.array(Sources.ALL, Sources.Source::toJson),
                "milestones", Json.array(Rules.MILESTONES, Rules.Milestone::toJson))));

        server.createContext("/api/engine/new", ex -> {
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

        server.createContext("/api/engine/state", ex -> withGame(ex, (game, q) -> game.toJson()));

        server.createContext("/api/engine/tick", ex -> withGame(ex, (game, q) -> {
            double hours;
            try {
                hours = Double.parseDouble(q.getOrDefault("hours", "1"));
            } catch (NumberFormatException e) {
                hours = 1;
            }
            hours = Math.max(0, Math.min(MAX_TICK_HOURS, hours));
            List<Event> events = game.tick(hours);
            return Json.obj("events", Json.array(events, Event::toJson), "state", game.toJson());
        }));

        server.createContext("/api/engine/act", ex -> withGame(ex, (game, q) -> {
            Game.Result r = game.act(q.getOrDefault("action", ""));
            return Json.obj("result", r.toJson(), "state", game.toJson());
        }));

        server.createContext("/", EngineServer::serveStatic);
        server.start();
        System.out.println("Payload Pets engine: http://localhost:" + port + "/  (local only, Ctrl+C to stop)");
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
                : name.endsWith(".svg") ? "image/svg+xml"
                : name.endsWith(".png") ? "image/png"
                : "application/octet-stream";
        send(ex, 200, type, Files.readAllBytes(file));
    }

    /** Lets the local showcase shell (Live Server / Map server) probe and embed localhost:8082. */
    private static void allowLocalPages(HttpExchange ex) {
        String origin = ex.getRequestHeaders().getFirst("Origin");
        if (origin != null && origin.matches("http://(localhost|127\\.0\\.0\\.1)(:\\d{1,5})?")) {
            ex.getResponseHeaders().set("Access-Control-Allow-Origin", origin);
            ex.getResponseHeaders().set("Vary", "Origin");
        }
    }

    private static void send(HttpExchange ex, int code, String type, byte[] body) throws IOException {
        allowLocalPages(ex);
        ex.getResponseHeaders().set("Content-Type", type);
        ex.getResponseHeaders().set("Cache-Control", "no-store");
        ex.sendResponseHeaders(code, body.length);
        try (var os = ex.getResponseBody()) {
            os.write(body);
        }
    }
}
