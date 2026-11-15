package data;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/**
 * A lunar landing site with real coordinates and terrain metadata.
 * Coordinates verified from Moon Trek CLPS_sites MapServer unless noted.
 */
public class Site {
    public final String id;
    public final String name;
    public final double lat;
    public final double lon;
    public final String region;        // "polar", "nearside", "farside"
    public final boolean coordVerified;
    public final double elevationM;    // metres, NaN if unknown
    public final Provenance provenance;

    // computed later
    public double slopeDegs = Double.NaN;
    public double illuminationPct = Double.NaN;
    public double earthVisibilityPct = Double.NaN;
    public double nearestPsrKm = Double.NaN;
    public double[] horizonProfile;    // 180 bins, degrees

    // Engine-branch decay multipliers, derived from the real numbers above:
    //   power     <- illumination (a dark site means heaters/survival eat power)
    //   happiness <- Earth visibility (the far side is a lonely place)
    // NaN until computed; omitted from JSON in offline builds.
    public double powerDecayMult     = Double.NaN;
    public double happinessDecayMult = Double.NaN;

    public Site(String id, String name, double lat, double lon,
                String region, boolean coordVerified, double elevationM,
                Provenance provenance) {
        this.id = id;
        this.name = name;
        this.lat = lat;
        this.lon = lon;
        this.region = region;
        this.coordVerified = coordVerified;
        this.elevationM = elevationM;
        this.provenance = provenance;
    }

    public String toJson() {
        StringBuilder sb = new StringBuilder("{");
        sb.append("\"id\":").append(JsonUtil.quote(id)).append(",");
        sb.append("\"name\":").append(JsonUtil.quote(name)).append(",");
        sb.append("\"lat\":").append(JsonUtil.fmt(lat, 4)).append(",");
        sb.append("\"lon\":").append(JsonUtil.fmt(lon, 4)).append(",");
        sb.append("\"region\":").append(JsonUtil.quote(region)).append(",");
        sb.append("\"coordVerified\":").append(coordVerified).append(",");
        if (!Double.isNaN(elevationM))
            sb.append("\"elevationM\":").append(JsonUtil.fmt(elevationM, 1)).append(",");
        if (!Double.isNaN(slopeDegs))
            sb.append("\"slopeDegs\":").append(JsonUtil.fmt(slopeDegs, 2)).append(",");
        if (!Double.isNaN(illuminationPct))
            sb.append("\"illuminationPct\":").append(JsonUtil.fmt(illuminationPct, 1)).append(",");
        if (!Double.isNaN(earthVisibilityPct))
            sb.append("\"earthVisibilityPct\":").append(JsonUtil.fmt(earthVisibilityPct, 1)).append(",");
        if (!Double.isNaN(powerDecayMult) && !Double.isNaN(happinessDecayMult)) {
            sb.append("\"decayMultipliers\":{")
              .append("\"power\":").append(JsonUtil.fmt(powerDecayMult, 2)).append(",")
              .append("\"happiness\":").append(JsonUtil.fmt(happinessDecayMult, 2))
              .append("},");
        }
        if (!Double.isNaN(nearestPsrKm))
            sb.append("\"nearestPsrKm\":").append(JsonUtil.fmt(nearestPsrKm, 1)).append(",");
        if (horizonProfile != null) {
            sb.append("\"horizonProfile\":[");
            for (int i = 0; i < horizonProfile.length; i++) {
                if (i > 0) sb.append(",");
                sb.append(JsonUtil.fmt(horizonProfile[i], 2));
            }
            sb.append("],");
        }
        sb.append("\"provenance\":").append(provenance.toJson());
        sb.append("}");
        return sb.toString();
    }

    // ── Registry of all known CLPS sites ───────────────────────

    private static final Provenance MOON_TREK = new Provenance(
        "NASA Moon Trek CLPS_sites MapServer",
        "feature-service-query",
        "https://trek.nasa.gov/moon/trekarcgis3/rest/services/CLPS_sites/MapServer/0/query",
        "2026-11-14"
    );

    private static final Provenance MISSION_PAGE = new Provenance(
        "science.nasa.gov CLPS deliveries",
        "manual-extraction",
        "https://science.nasa.gov/lunar-discovery/deliveries",
        "2026-11-14"
    );

    public static List<Site> all() {
        return Collections.unmodifiableList(Arrays.asList(
            // ── 7 verified sites from Moon Trek feature service ──
            // Site ids use the story branch's convention (Missions.java:
            // "keep the ids stable"); the story branch references these
            // exact ids in MissionMoments / SkyModel.
            new Site("SINUS_VISCOSITATIS", "Sinus Viscositatis",
                35.26, -40.99, "nearside", true, Double.NaN, MOON_TREK),

            new Site("MALAPERT_A", "Malapert A",
                -80.13, 1.44, "polar", true, 2596.0, MOON_TREK),

            new Site("MARE_CRISIUM", "Mare Crisium (Mons Latreille)",
                16.18, 59.10, "nearside", true, -3569.0, MOON_TREK),

            new Site("NOBILE_REGION", "Nobile Region",
                -85.28, 53.27, "polar", true, Double.NaN, MOON_TREK),

            new Site("SHACKLETON_RIDGE", "Shackleton Connecting Ridge",
                -89.63, 132.32, "polar", true, -2632.0, MOON_TREK),

            new Site("REINER_GAMMA", "Reiner Gamma",
                7.39, -58.96, "nearside", true, Double.NaN, MOON_TREK),

            new Site("SCHRODINGER_BASIN", "Schrödinger Basin",
                -74.73, 132.93, "farside", true, Double.NaN, MOON_TREK),

            // ── Additional sites from CLPS delivery pages (coords approximate) ──
            new Site("GRUITHUISEN_DOMES", "Gruithuisen Domes",
                36.1, -40.5, "nearside", false, Double.NaN, MISSION_PAGE),

            new Site("MONS_MOUTON", "Mons Mouton",
                -84.6, 30.0, "polar", false, 5005.0, MISSION_PAGE),

            new Site("FAR_SIDE", "Lunar Far Side (TBD)",
                -10.0, 180.0, "farside", false, Double.NaN, MISSION_PAGE),

            new Site("SOUTH_POLE_BO", "South Pole (Blue Origin)",
                -89.5, 0.0, "polar", false, Double.NaN, MISSION_PAGE),

            new Site("SOUTH_POLE_BG4", "South Pole (Blue Ghost 4)",
                -89.5, 10.0, "polar", false, Double.NaN, MISSION_PAGE),

            new Site("SOUTH_POLE_NOVAD", "South Pole (Nova-D)",
                -89.5, 20.0, "polar", false, Double.NaN, MISSION_PAGE)
        ));
    }
}
