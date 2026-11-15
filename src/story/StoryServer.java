package story;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Java web server for the story part of Payload Pets. No libraries needed (JDK only).
 *
 *   GET /api/missions                              CLPS missions
 *   GET /api/moments?site=SITE&progress=0..1       pop-ups due so far at that point in the lunar day
 *   GET /api/passport?site=&pet=&name=&progress=   the Pet Passport
 *   everything else                                static files from ./web
 */
public class StoryServer {

    private static final Path ROOT = Path.of("web", "story").toAbsolutePath().normalize();

    /** Built-in moments, plus the data branch's pop-up stories when data/ is present. */
    private static List<MissionMoment> moments = MissionMoments.ALL;

    public static void main(String[] args) throws IOException {
        int port = 8081; // the map branch uses 8080
        Path dataDir = Path.of("data");
        for (int i = 0; i < args.length; i++) {
            if (args[i].equals("--data") && i + 1 < args.length) dataDir = Path.of(args[++i]);
            else port = Integer.parseInt(args[i]);
        }

        DataBranch data = DataBranch.load(dataDir);
        SkyModel.useData(data);
        if (data != null) {
            List<MissionMoment> all = new java.util.ArrayList<>(MissionMoments.ALL);
            all.addAll(data.events());
            moments = List.copyOf(all);
            System.out.println("Using data from " + dataDir.toAbsolutePath() + ": " + data.sites().size() + " sites, "
                    + data.events().size() + " extra stories, ephemeris " + (data.hasEphemeris() ? "yes" : "no"));
        } else {
            System.out.println("No data/ folder found: using built-in story content and the simplified sky model.");
        }
        // Loopback only: reachable from this computer, not from the network.
        HttpServer server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), port), 0);

        server.createContext("/api/missions", ex ->
                json(ex, Json.array(Missions.ALL, Mission::toJson)));

        server.createContext("/api/sites", ex -> json(ex, SkyModel.listJson()));

        server.createContext("/api/sky", ex -> {
            SkyModel.Site s = SkyModel.find(query(ex).getOrDefault("site", ""));
            if (s == null) {
                send(ex, 404, "application/json; charset=utf-8", "{\"error\":\"unknown site\"}".getBytes(StandardCharsets.UTF_8));
                return;
            }
            LocalDate start;
            try {
                start = LocalDate.parse(query(ex).getOrDefault("date", ""));
            } catch (DateTimeParseException e) {
                start = LocalDate.now(ZoneOffset.UTC);
            }
            json(ex, SkyModel.skyJson(s, start));
        });

        server.createContext("/api/pets",ex -> json(ex, Json.array(Pets.ALL, Pet::toJson)));

        server.createContext("/api/moments", ex -> {
            Map<String, String> q = query(ex);
            StoryEngine engine = new StoryEngine(q.getOrDefault("site", ""), q.getOrDefault("pet", ""), moments);
            List<MissionMoment> due = engine.advance(progress(q));
            json(ex, Json.array(due, MissionMoment::toJson));
        });

        server.createContext("/api/passport", ex -> {
            Map<String, String> q = query(ex);
            String site = q.getOrDefault("site", "");
            double progress = progress(q);
            Pet pet = Pets.find(q.getOrDefault("pet", ""));
            StoryEngine engine = new StoryEngine(site, pet.id(), moments);
            engine.advance(progress);
            String name = q.getOrDefault("name", "").isBlank() ? pet.name() : q.get("name").trim();
            if (name.length() > 24) name = name.substring(0, 24);
            String missionName = Missions.ALL.stream().filter(m -> m.id().equals(pet.missionId()))
                    .map(Mission::name).findFirst().orElse("CLPS mission");
            List<String> science = new java.util.ArrayList<>(pet.science());
            for (String line : q.getOrDefault("science", "").split("\\|")) {
                String t = line.trim();
                if (!t.isEmpty() && science.size() < 6) science.add(t.length() > 100 ? t.substring(0, 100) : t);
            }
            PetPassport passport = new PetPassport(name, pet.label(missionName),
                    SkyModel.name(site), PetPassport.toEarthDays(progress),
                    science, engine.history());
            json(ex, passport.toJson());
        });

        server.createContext("/", StoryServer::serveStatic);

        server.start();
        System.out.println("Payload Pets story site: http://localhost:" + port + "/  (Ctrl+C to stop)");
    }

    private static double progress(Map<String, String> q) {
        try {
            return Math.max(0, Math.min(1, Double.parseDouble(q.getOrDefault("progress", "0"))));
        } catch (NumberFormatException e) {
            return 0;
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
        if (path.equals("/")) path = "/index.html";
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

    private static void send(HttpExchange ex, int code, String type, byte[] body) throws IOException {
        ex.getResponseHeaders().set("Content-Type", type);
        ex.getResponseHeaders().set("Cache-Control", "no-store");
        ex.sendResponseHeaders(code, body.length);
        try (var os = ex.getResponseBody()) {
            os.write(body);
        }
    }
}
