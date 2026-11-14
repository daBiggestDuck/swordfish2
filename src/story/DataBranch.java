package story;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Optional reader for the static JSON the data branch (Wonil) builds into {@code data/}.
 * Everything here is optional: if a file is missing the story falls back to its built-in content,
 * so story works on its own and gets better once data lands.
 *
 * Reads: sites.json (real coordinates and illumination), mission-events.json (pop-up stories),
 * missions.json (which site each mission used), ephemeris.json (real sub-solar / sub-Earth
 * points from JPL Horizons, 3-hour steps).
 */
public final class DataBranch {

    public static final String SOURCE = "NASA JPL Horizons ephemeris + Moon Trek (data branch)";

    private final List<SkyModel.Site> sites = new ArrayList<>();
    private final Map<String, Map<String, Object>> siteExtras = new HashMap<>();
    private final List<MissionMoment> events = new ArrayList<>();

    // ephemeris, parallel arrays: sub-solar lon/lat, sub-Earth lon/lat (degrees)
    private double[] slo = new double[0], sla = new double[0], elo = new double[0], ela = new double[0];
    private double startEpochDay;
    private double stepDays = 3.0 / 24.0;

    private DataBranch() {}

    /** Loads whatever is in {@code dir}; returns null if the folder has none of the files. */
    public static DataBranch load(Path dir) {
        if (dir == null || !Files.isDirectory(dir)) return null;
        DataBranch d = new DataBranch();
        Map<String, Map<String, Object>> missions = d.loadMissions(dir);
        d.loadSites(dir);
        d.loadEphemeris(dir);
        d.loadEvents(dir, missions);
        boolean any = !d.sites.isEmpty() || !d.events.isEmpty() || d.slo.length > 0;
        return any ? d : null;
    }

    public List<SkyModel.Site> sites() { return sites; }

    public List<MissionMoment> events() { return events; }

    public boolean hasEphemeris() { return slo.length > 0; }

    public Map<String, Object> siteExtras(String id) { return siteExtras.getOrDefault(id, Map.of()); }

    /** True if the ephemeris covers this instant. */
    public boolean covers(double epochDay) {
        return index(epochDay) >= 0;
    }

    /** {subSolarLon, subSolarLat, subEarthLon, subEarthLat} nearest to {@code epochDay}, or null. */
    public double[] positionAt(double epochDay) {
        int k = index(epochDay);
        return k < 0 ? null : new double[] {slo[k], sla[k], elo[k], ela[k]};
    }

    private int index(double epochDay) {
        if (slo.length == 0) return -1;
        long k = Math.round((epochDay - startEpochDay) / stepDays);
        return (k < 0 || k >= slo.length) ? -1 : (int) k;
    }

    // ---------------------------------------------------------------- loaders

    private Map<String, Map<String, Object>> loadMissions(Path dir) {
        Map<String, Map<String, Object>> out = new HashMap<>();
        for (Object o : list(dir, "missions.json")) {
            Map<String, Object> m = MiniJson.map(o);
            String id = MiniJson.str(m, "id");
            if (id != null) out.put(id, m);
        }
        return out;
    }

    private void loadSites(Path dir) {
        for (Object o : list(dir, "sites.json")) {
            Map<String, Object> m = MiniJson.map(o);
            String id = MiniJson.str(m, "id");
            if (id == null || !(m.get("lat") instanceof Double lat) || !(m.get("lon") instanceof Double lon)) continue;
            String name = MiniJson.str(m, "name");
            sites.add(new SkyModel.Site(id, name == null ? id : name, lat, lon));
            siteExtras.put(id, m);
        }
    }

    private void loadEphemeris(Path dir) {
        Path f = dir.resolve("ephemeris.json");
        if (!Files.isRegularFile(f)) return;
        try {
            Map<String, Object> root = MiniJson.map(MiniJson.parse(Files.readString(f)));
            List<Object> rows = MiniJson.list(root.get("rows"));
            String start = MiniJson.str(root, "startDate");
            if (rows.isEmpty() || start == null) return;
            startEpochDay = LocalDate.parse(start).atStartOfDay().toInstant(ZoneOffset.UTC).getEpochSecond() / 86400.0;
            stepDays = MiniJson.num(root, "stepHours", 3) / 24.0;
            int n = rows.size();
            slo = new double[n]; sla = new double[n]; elo = new double[n]; ela = new double[n];
            for (int i = 0; i < n; i++) {
                Map<String, Object> r = MiniJson.map(rows.get(i));
                slo[i] = MiniJson.num(r, "slo", 0);
                sla[i] = MiniJson.num(r, "sla", 0);
                elo[i] = MiniJson.num(r, "elo", 0);
                ela[i] = MiniJson.num(r, "ela", 0);
            }
        } catch (Exception e) {
            System.err.println("story: could not read ephemeris.json (" + e.getMessage() + "); using the simplified model");
            slo = sla = elo = ela = new double[0];
        }
    }

    private void loadEvents(Path dir, Map<String, Map<String, Object>> missions) {
        for (Object o : list(dir, "mission-events.json")) {
            Map<String, Object> e = MiniJson.map(o);
            String id = MiniJson.str(e, "id");
            String title = MiniJson.str(e, "title");
            String text = MiniJson.str(e, "description");
            if (id == null || title == null || text == null) continue;
            Map<String, Object> mission = missions.getOrDefault(MiniJson.str(e, "missionId"), Map.of());
            String site = MiniJson.str(mission, "siteId");
            String lander = MiniJson.str(mission, "lander");
            String vendor = MiniJson.str(mission, "vendor");
            String missionName = lander == null ? "CLPS mission" : lander + (vendor == null ? "" : " (" + vendor + ")");
            String url = MiniJson.str(e, "sourceUrl");
            events.add(new MissionMoment("data-" + id, site == null ? "ANY" : site, missionName, title, text,
                    phaseToDay(MiniJson.str(e, "lunarPhase")), url == null ? MissionMoments.CLPS_PAGE : url));
        }
    }

    /** Where in the lunar day (0..1) each data-branch phase tag triggers. */
    static double phaseToDay(String phase) {
        if (phase == null) return 0.55;
        return switch (phase) {
            case "sunrise" -> 0.05;
            case "day" -> 0.40;
            case "sunset" -> 0.90;
            case "night" -> 0.96;
            default -> 0.55;
        };
    }

    private static List<Object> list(Path dir, String file) {
        Path f = dir.resolve(file);
        if (!Files.isRegularFile(f)) return List.of();
        try {
            return MiniJson.list(MiniJson.parse(Files.readString(f)));
        } catch (Exception e) {
            System.err.println("story: could not read " + file + " (" + e.getMessage() + "); skipping it");
            return List.of();
        }
    }
}
