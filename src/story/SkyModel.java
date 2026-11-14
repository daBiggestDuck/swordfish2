package story;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;

/**
 * Where are the Sun and Earth in the sky at this site, on this date?
 *
 * Two modes:
 *  1. REAL (when the data branch's {@code data/ephemeris.json} is loaded and covers the date):
 *     uses JPL Horizons sub-solar and sub-Earth points, so it includes the Moon's axis tilt and
 *     libration. sin(el) = sin(lat) sin(pointLat) + cos(lat) cos(pointLat) cos(lon - pointLon).
 *     This is still a smooth sphere: local terrain (hills hiding the Sun) is not included.
 *  2. SIMPLIFIED (fallback): the Sun drifts 360 degrees per synodic month from the 2025-01-29 new
 *     moon, ignoring axis tilt (so polar lighting is understated), and Earth is fixed in the sky.
 *
 * Built-in site coordinates: Mare Crisium = Blue Ghost 1 touchdown (NASA NSSDCA), Malapert A =
 * IM-1 touchdown (NASA LRO release). Mons Mouton, Reiner Gamma and Shackleton Connecting Ridge are
 * approximate target areas. When the data branch is loaded, its site list is used instead.
 */
public final class SkyModel {

    public record Site(String id, String name, double lat, double lon) {}

    private static final List<Site> BUILT_IN = List.of(
            new Site("MARE_CRISIUM", "Mare Crisium", 18.56, 61.81),
            new Site("MALAPERT_A", "Malapert A", -80.13, 1.44),
            new Site("MONS_MOUTON", "Mons Mouton", -84.8, 29.2),
            new Site("REINER_GAMMA", "Reiner Gamma", 7.5, -59.0),
            new Site("SHACKLETON_RIDGE", "Shackleton Connecting Ridge", -89.5, 0.0));

    public static final int SAMPLES = 119;           // about 4 samples per day over one month
    public static final double SYNODIC_DAYS = 29.530588;
    /** The game plays one lunar day of daylight: about half a month. */
    public static final double GAME_DAYS = SYNODIC_DAYS / 2.0;

    private static final double NEW_MOON_EPOCH_DAY =
            Instant.parse("2025-01-29T12:36:00Z").getEpochSecond() / 86400.0;

    private static volatile DataBranch data;

    private SkyModel() {}

    /** Called once at startup; pass null to use only the built-in model. */
    public static void useData(DataBranch d) {
        data = d;
    }

    public static List<Site> sites() {
        DataBranch d = data;
        return d != null && !d.sites().isEmpty() ? d.sites() : BUILT_IN;
    }

    public static Site find(String id) {
        return sites().stream().filter(s -> s.id().equals(id)).findFirst().orElse(null);
    }

    public static String name(String id) {
        Site s = find(id);
        return s == null ? "Unknown site" : s.name();
    }

    private static double epochDay(LocalDate d) {
        return d.atStartOfDay().toInstant(ZoneOffset.UTC).getEpochSecond() / 86400.0;
    }

    private static double elevation(Site s, double pointLat, double pointLon) {
        double lat = Math.toRadians(s.lat());
        double pl = Math.toRadians(pointLat);
        double v = Math.sin(lat) * Math.sin(pl)
                + Math.cos(lat) * Math.cos(pl) * Math.cos(Math.toRadians(s.lon() - pointLon));
        return Math.toDegrees(Math.asin(Math.max(-1, Math.min(1, v))));
    }

    /** Sun height in degrees. {@code real} = use the ephemeris (caller checked it covers the date). */
    static double sun(Site s, double epochDay, boolean real) {
        double[] p = real ? data.positionAt(epochDay) : null;
        if (p != null) return elevation(s, p[1], p[0]);
        double t = (epochDay - NEW_MOON_EPOCH_DAY) % SYNODIC_DAYS;
        if (t < 0) t += SYNODIC_DAYS;
        return elevation(s, 0, 180.0 - 360.0 * t / SYNODIC_DAYS);
    }

    /** Earth height in degrees (negative = below the horizon, no radio link). */
    static double earth(Site s, double epochDay, boolean real) {
        double[] p = real ? data.positionAt(epochDay) : null;
        return p != null ? elevation(s, p[3], p[2]) : elevation(s, 0, 0);
    }

    /** Average flat-panel power (0..1) over one game day starting at {@code startEpochDay}. */
    static double avgPower(Site s, double startEpochDay, boolean real) {
        int n = 30;
        double sum = 0;
        for (int k = 0; k < n; k++) {
            double e = sun(s, startEpochDay + GAME_DAYS * k / (n - 1), real);
            sum += Math.max(0, Math.sin(Math.toRadians(e)));
        }
        return sum / n;
    }

    private static double round1(double v) {
        return Math.round(v * 10.0) / 10.0;
    }

    public static String listJson() {
        return Json.array(sites(), s -> {
            StringBuilder sb = new StringBuilder("{\"id\":" + Json.q(s.id()) + ",\"name\":" + Json.q(s.name())
                    + ",\"lat\":" + s.lat() + ",\"lon\":" + s.lon());
            DataBranch d = data;
            if (d != null) {
                Map<String, Object> x = d.siteExtras(s.id());
                if (MiniJson.str(x, "region") != null) sb.append(",\"region\":").append(Json.q(MiniJson.str(x, "region")));
                if (x.get("illuminationPct") instanceof Double v) sb.append(",\"illuminationPct\":").append(v);
                if (x.get("earthVisibilityPct") instanceof Double v) sb.append(",\"earthVisibilityPct\":").append(v);
            }
            return sb.append('}').toString();
        });
    }

    /** Sun and Earth heights over one month from {@code start}, plus the best landing date. */
    public static String skyJson(Site s, LocalDate start) {
        double t0 = epochDay(start);
        DataBranch d = data;
        boolean real = d != null && d.hasEphemeris() && d.covers(t0) && d.covers(t0 + SYNODIC_DAYS);

        StringBuilder sun = new StringBuilder("[");
        StringBuilder earth = new StringBuilder("[");
        int earthUp = 0;
        for (int i = 0; i < SAMPLES; i++) {
            double t = t0 + SYNODIC_DAYS * i / (SAMPLES - 1);
            double ee = earth(s, t, real);
            if (i > 0) { sun.append(','); earth.append(','); }
            sun.append(round1(sun(s, t, real)));
            earth.append(round1(ee));
            if (ee > 0) earthUp++;
        }
        sun.append(']');
        earth.append(']');

        int bestOffset = 0;
        double best = -1;
        for (int off = 0; off < 30; off++) {
            double p = avgPower(s, t0 + off, real);
            if (p > best) { best = p; bestOffset = off; }
        }
        double earth0 = earth(s, t0, real);
        StringBuilder out = new StringBuilder("{\"id\":" + Json.q(s.id()) + ",\"name\":" + Json.q(s.name())
                + ",\"lat\":" + s.lat() + ",\"lon\":" + s.lon()
                + ",\"startDate\":" + Json.q(start.toString())
                + ",\"monthDays\":" + round1(SYNODIC_DAYS) + ",\"gameDays\":" + round1(GAME_DAYS)
                + ",\"earthElevation\":" + round1(earth0) + ",\"earthVisible\":" + (earth0 > 0)
                + ",\"earthVisiblePct\":" + round1(100.0 * earthUp / SAMPLES)
                + ",\"avgPowerPct\":" + round1(avgPower(s, t0, real) * 100)
                + ",\"bestStartDate\":" + Json.q(start.plusDays(bestOffset).toString())
                + ",\"bestAvgPowerPct\":" + round1(best * 100)
                + ",\"sun\":" + sun + ",\"earth\":" + earth
                + ",\"real\":" + real
                + ",\"model\":" + Json.q(real ? DataBranch.SOURCE : "simplified geometry, not NASA ephemeris"));
        if (d != null) {
            Map<String, Object> x = d.siteExtras(s.id());
            if (x.get("illuminationPct") instanceof Double v) out.append(",\"illuminationPct\":").append(v);
            if (x.get("earthVisibilityPct") instanceof Double v) out.append(",\"earthVisibilityPct\":").append(v);
        }
        return out.append('}').toString();
    }
}
