package map;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Pure-JDK HTTP server for the Lunar Map, Filters, Target Dossier, and Site Picker.
 * Mirrors StoryServer.java conventions so branches integrate cleanly with zero external libraries.
 */
public class MapServer {

    private static final Path WEB_ROOT = Path.of("web").toAbsolutePath().normalize();

    public static void main(String[] args) throws IOException {
        int port = args.length > 0 ? Integer.parseInt(args[0]) : 8080;
        MapDataLoader loader = MapDataLoader.defaultLoader();
        MapModels.DatasetBundle bundle = loader.load();

        HttpServer server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), port), 0);

        server.createContext("/api/map/data", ex -> json(ex, JsonCodec.stringify(bundle.toMap())));

        server.createContext("/api/map/sites", ex -> {
            Map<String, String> q = query(ex);
            List<MapModels.LandingSite> filtered = MapFilterService.filterSites(bundle, q);
            json(ex, JsonCodec.stringify(filtered.stream().map(MapModels.LandingSite::toMap).toList()));
        });

        // Compatible alias for origin/story
        server.createContext("/api/sites", ex -> {
            Map<String, String> q = query(ex);
            List<MapModels.LandingSite> filtered = MapFilterService.filterSites(bundle, q);
            json(ex, JsonCodec.stringify(filtered.stream().map(MapModels.LandingSite::toMap).toList()));
        });

        server.createContext("/api/map/missions", ex -> {
            Map<String, String> q = query(ex);
            List<MapModels.ClpsMission> filtered = MapFilterService.filterMissions(bundle, q);
            json(ex, JsonCodec.stringify(filtered.stream().map(MapModels.ClpsMission::toMap).toList()));
        });

        server.createContext("/api/missions", ex -> {
            Map<String, String> q = query(ex);
            List<MapModels.ClpsMission> filtered = MapFilterService.filterMissions(bundle, q);
            json(ex, JsonCodec.stringify(filtered.stream().map(MapModels.ClpsMission::toMap).toList()));
        });

        server.createContext("/api/map/sky", ex -> serveSky(ex, bundle));
        server.createContext("/api/sky", ex -> serveSky(ex, bundle));

        server.createContext("/api/map/evaluate", ex -> {
            Map<String, String> q = query(ex);
            double lat = parseDouble(q.get("lat"), -89.63);
            double lon = parseDouble(q.get("lon"), 132.32);
            int sample = (int) parseDouble(q.get("sample"), 141);
            json(ex, JsonCodec.stringify(LunarMath.evaluateDropPoint(bundle, lat, lon, sample)));
        });

        server.createContext("/api/map/compare", ex -> {
            Map<String, String> q = query(ex);
            String raw = q.getOrDefault("sites", "");
            List<String> ids = raw.isBlank() ? List.of() : Arrays.asList(raw.split(","));
            json(ex, JsonCodec.stringify(MapFilterService.compareSites(bundle, ids)));
        });

        server.createContext("/api/map/cascade", ex -> {
            Map<String, String> q = query(ex);
            String missionId = q.getOrDefault("mission", "blue-ghost-2");
            json(ex, JsonCodec.stringify(MapFilterService.simulateCascade(bundle, missionId)));
        });

        server.createContext("/api/map/recipe", ex -> {
            Map<String, String> q = query(ex);
            String siteId = q.getOrDefault("site", "MONS_MOUTON");
            double mass = parseDouble(q.get("mass"), 25.0);
            double power = parseDouble(q.get("power"), 90.0);
            json(ex, JsonCodec.stringify(MapFilterService.recommendRecipe(bundle, siteId, mass, power)));
        });

        server.createContext("/api/map/raw/", ex -> {
            String path = ex.getRequestURI().getPath();
            String key = path.substring("/api/map/raw/".length()).replaceAll("[^a-zA-Z0-9_]", "");
            String raw = loader.readRawFile(key);
            if (raw == null) {
                send(ex, 404, "application/json; charset=utf-8",
                        "{\"error\":\"unknown raw dataset\"}".getBytes(StandardCharsets.UTF_8));
                return;
            }
            json(ex, raw);
        });

        server.createContext("/", MapServer::serveStatic);

        server.start();
        System.out.println("Payload Pets Lunar Map Server: http://localhost:" + port + "/  (Ctrl+C to stop)");
    }

    private static void serveSky(HttpExchange ex, MapModels.DatasetBundle bundle) throws IOException {
        Map<String, String> q = query(ex);
        String siteId = q.getOrDefault("site", "SHACKLETON_RIM");
        MapModels.LandingSite site = MapFilterService.findSite(bundle, siteId);
        if (site == null) {
            send(ex, 404, "application/json; charset=utf-8",
                    "{\"error\":\"unknown site\"}".getBytes(StandardCharsets.UTF_8));
            return;
        }
        String rawSample = q.get("sample");
        String dateParam = q.getOrDefault("date", "").trim();
        boolean validDate = isValidIsoDate(dateParam);
        int sample = (rawSample != null && !rawSample.isBlank())
                ? (int) parseDouble(rawSample, 141)
                : (validDate ? LunarMath.sampleIndexForDate(bundle.ephemeris(), dateParam) : 141);
        Map<String, Object> sky = LunarMath.computeSiteSky(site, bundle.ephemeris(), sample);
        if (validDate) sky.put("startDate", dateParam);
        json(ex, JsonCodec.stringify(sky));
    }

    private static boolean isValidIsoDate(String date) {
        if (date == null || !date.matches("\\d{4}-\\d{2}-\\d{2}")) return false;
        try {
            java.time.LocalDate.parse(date);
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }

    private static double parseDouble(String raw, double fallback) {
        if (raw == null || raw.isBlank()) return fallback;
        try {
            return Double.parseDouble(raw);
        } catch (NumberFormatException e) {
            return fallback;
        }
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

    private static void json(HttpExchange ex, String body) throws IOException {
        send(ex, 200, "application/json; charset=utf-8", body.getBytes(StandardCharsets.UTF_8));
    }

    private static void serveStatic(HttpExchange ex) throws IOException {
        String path = ex.getRequestURI().getPath();
        if (path.equals("/")) {
            path = Files.isRegularFile(WEB_ROOT.resolve("index.html")) ? "/index.html" : "/map.html";
        } else if (path.equals("/map")) {
            path = "/map.html";
        } else if (path.equals("/story")) {
            path = "/story.html";
        }
        Path file = WEB_ROOT.resolve(path.substring(1)).normalize();
        if (!file.startsWith(WEB_ROOT) || !Files.isRegularFile(file)) {
            send(ex, 404, "text/plain; charset=utf-8", "Not found".getBytes(StandardCharsets.UTF_8));
            return;
        }
        String name = file.getFileName().toString();
        String type = name.endsWith(".html") ? "text/html; charset=utf-8"
                : name.endsWith(".css") ? "text/css; charset=utf-8"
                : name.endsWith(".js") ? "text/javascript; charset=utf-8"
                : name.endsWith(".json") ? "application/json; charset=utf-8"
                : name.endsWith(".svg") ? "image/svg+xml"
                : name.endsWith(".png") ? "image/png"
                : (name.endsWith(".jpg") || name.endsWith(".jpeg")) ? "image/jpeg"
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
