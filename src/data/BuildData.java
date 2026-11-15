package data;

import java.io.*;
import java.util.ArrayList;
import java.util.List;

/**
 * Main data pipeline. Run once offline to produce the static JSON
 * that the frontend imports.
 *
 * Usage:
 *   cd swordfish2
 *   javac -d build src/data/*.java
 *   java -cp build data.BuildData [--offline]
 *
 * --offline  skips network fetches (Horizons + Moon Trek) and uses
 *            placeholder values. Use when APIs are unreachable.
 *
 * Output:
 *   data/sites.json
 *   data/missions.json
 *   data/game-missions.json
 *   data/payloads.json
 *   data/pet-archetypes.json
 *   data/mission-events.json
 *   data/ephemeris.json          (if online)
 *   data/horizons/<site-id>.json (if online)
 */
public class BuildData {

    private static boolean offline = false;
    private static final String OUT = "data";

    public static void main(String[] args) throws Exception {
        for (String a : args) {
            if ("--offline".equals(a)) offline = true;
        }

        System.out.println("═══════════════════════════════════════════");
        System.out.println("  Lunar Pets Data Pipeline");
        System.out.println("  Mode: " + (offline ? "OFFLINE (placeholders)" : "ONLINE (live APIs)"));
        System.out.println("═══════════════════════════════════════════\n");

        new File(OUT).mkdirs();
        new File(OUT + "/horizons").mkdirs();
        new File(OUT + "/sites").mkdirs();

        // ── 1. Sites ───────────────────────────────────────────
        List<Site> sites = Site.all();

        // ── 2. Ephemeris ───────────────────────────────────────
        List<EphemerisClient.Row> ephemeris = new ArrayList<>();
        if (!offline) {
            try {
                ephemeris = EphemerisClient.fetch("2024-01-01", "2029-01-01", "3h");
            } catch (Exception e) {
                System.err.println("[WARN] Ephemeris fetch failed: " + e.getMessage());
                System.err.println("[WARN] Falling back to offline mode for ephemeris.");
            }
        }

        // ── 3. Compute illumination + Earth visibility ─────────
        if (!ephemeris.isEmpty()) {
            double[] ssLon = EphemerisClient.subSolarLon(ephemeris);
            double[] ssLat = EphemerisClient.subSolarLat(ephemeris);
            double[] seLon = EphemerisClient.subEarthLon(ephemeris);
            double[] seLat = EphemerisClient.subEarthLat(ephemeris);

            for (Site site : sites) {
                // Flat-model illumination
                site.illuminationPct = 100.0 * SkyMath.illuminationFraction(
                    site.lat, site.lon, ssLon, ssLat, null);

                // Earth visibility
                site.earthVisibilityPct = 100.0 * SkyMath.earthVisibilityFraction(
                    site.lat, site.lon, seLon, seLat);

                System.out.printf("  %-30s  illum=%5.1f%%  earth=%5.1f%%%n",
                    site.name, site.illuminationPct, site.earthVisibilityPct);
            }
        }

        // ── 4. Terrain horizon profiles ───────────────────────
        // The geographic-bbox DEM approach breaks at extreme polar
        // latitudes (>85°) due to projection distortion. For these
        // sites we use validated results from an independent Python
        // computation (PLAN.md §3.4) with the SPole45 100m DEM in
        // native stereographic projection + bilinear + median filter.
        //
        // Non-polar sites and moderate-polar (70–85°) can be fetched
        // live. If the live fetch returns suspicious results (max=90°),
        // we fall back to the published illumination fraction.

        // Validated horizon summaries (from Python pipeline, 2026-11-14):
        // Malapert A:       max=16.4° mean=4.8°  → terrain illum 48.8%
        // Schrödinger:      max=8.2°  mean=3.1°  → terrain illum ~47%  (farside, 0% Earth)
        // Mons Mouton:      max=12.0° mean=6.7°  → terrain illum ~1%   (deep crater)
        // Shackleton Ridge: max=86.1° mean=78.1° → terrain illum ~0%   (in a deep shadow)

        if (!offline && !ephemeris.isEmpty()) {
            double[] ssLon = EphemerisClient.subSolarLon(ephemeris);
            double[] ssLat = EphemerisClient.subSolarLat(ephemeris);

            for (Site site : sites) {
                if (Math.abs(site.lat) < 70) continue;
                if (!site.coordVerified) continue;

                try {
                    double[] hp = fetchAndComputeHorizon(site);
                    double maxH = HorizonProfile.max(hp);
                    double meanH = HorizonProfile.mean(hp);
                    System.out.printf("  %-30s  horizon max=%.1f° mean=%.1f°",
                        site.name, maxH, meanH);

                    if (maxH >= 85.0) {
                        // Projection distortion — use published/validated values
                        System.out.println("  [distorted — using validated fallback]");
                        continue;
                    }

                    // Good horizon: use it
                    site.horizonProfile = hp;
                    double terrainIllum = 100.0 * SkyMath.illuminationFraction(
                        site.lat, site.lon, ssLon, ssLat, hp);
                    System.out.printf("  flat=%.1f%% terrain=%.1f%%%n",
                        site.illuminationPct, terrainIllum);
                    site.illuminationPct = terrainIllum;

                    writeFile(OUT + "/horizons/" + site.id + ".json",
                              HorizonProfile.toJson(hp));

                } catch (Exception e) {
                    System.err.println("  [WARN] Horizon failed for " + site.name
                                       + ": " + e.getMessage());
                }
            }

            // Apply validated illumination overrides for sites where
            // the Java DEM fetch failed due to pole projection issues.
            // These were computed in Python with native stereographic
            // coordinates and are documented in PLAN.md.
            for (Site site : sites) {
                if (site.horizonProfile != null) continue; // already computed
                switch (site.id) {
                    case "MALAPERT_A":
                        site.illuminationPct = 48.8;
                        System.out.println("  Malapert A: using validated terrain illum 48.8%");
                        break;
                    case "MONS_MOUTON":
                        site.illuminationPct = 1.1;
                        System.out.println("  Mons Mouton: using validated terrain illum 1.1% (deep crater)");
                        break;
                    case "SHACKLETON_RIDGE":
                        site.illuminationPct = 0.5;
                        System.out.println("  Shackleton Ridge: using validated terrain illum 0.5%");
                        break;
                    case "NOBILE_REGION":
                        site.illuminationPct = 45.0; // approximate, near-polar
                        System.out.println("  Nobile Region: using estimated terrain illum 45%");
                        break;
                }
            }
        }

        // ── 5. Write JSON outputs ──────────────────────────────

        // Engine-branch decay multipliers — computed LAST, from the final
        // illumination/Earth-visibility values (after terrain overrides):
        //   power     <- illumination (dark site → heaters eat power)
        //   happiness <- Earth visibility (far side → lonely pet)
        // Range tuned so the brightest site ≈ 1.25 and a permanently-dark
        // site ≈ 1.8 (engine's sample-shape values).
        for (Site site : sites) {
            if (!Double.isNaN(site.illuminationPct) && !Double.isNaN(site.earthVisibilityPct)) {
                site.powerDecayMult = clamp(0.7 + 1.1 * (1.0 - site.illuminationPct / 100.0), 0.7, 1.8);
                site.happinessDecayMult = clamp(0.9 + 0.9 * (1.0 - site.earthVisibilityPct / 100.0), 0.9, 1.8);
            }
        }

        // sites.json
        List<String> siteJsons = new ArrayList<>();
        for (Site s : sites) siteJsons.add(s.toJson());
        writeFile(OUT + "/sites.json", JsonUtil.array(siteJsons));
        System.out.println("\n✓ data/sites.json (" + sites.size() + " sites)");

        // missions.json
        List<Mission> missions = Mission.all();
        List<String> missionJsons = new ArrayList<>();
        for (Mission m : missions) missionJsons.add(m.toJson());
        writeFile(OUT + "/missions.json", JsonUtil.array(missionJsons));
        System.out.println("✓ data/missions.json (" + missions.size() + " missions)");

        // game-missions.json — engine-branch missions derived from the
        // real payload manifest (shape: engine README "Data shapes").
        List<GameMission> gameMissions = GameMission.all(missions, Payload.all(), PetArchetype.all());
        List<String> gameJsons = new ArrayList<>();
        for (GameMission g : gameMissions) gameJsons.add(g.toJson());
        writeFile(OUT + "/game-missions.json", JsonUtil.array(gameJsons));
        System.out.println("✓ data/game-missions.json (" + gameMissions.size() + " gameplay missions)");

        // payloads.json
        List<Payload> payloads = Payload.all();
        List<String> payloadJsons = new ArrayList<>();
        for (Payload p : payloads) payloadJsons.add(p.toJson());
        writeFile(OUT + "/payloads.json", JsonUtil.array(payloadJsons));
        System.out.println("✓ data/payloads.json (" + payloads.size() + " payloads)");

        // pet-archetypes.json
        List<PetArchetype> pets = PetArchetype.all();
        List<String> petJsons = new ArrayList<>();
        for (PetArchetype p : pets) petJsons.add(p.toJson());
        writeFile(OUT + "/pet-archetypes.json", JsonUtil.array(petJsons));
        System.out.println("✓ data/pet-archetypes.json (" + pets.size() + " archetypes)");

        // mission-events.json
        List<MissionEvent> events = MissionEvent.all();
        List<String> eventJsons = new ArrayList<>();
        for (MissionEvent e : events) eventJsons.add(e.toJson());
        writeFile(OUT + "/mission-events.json", JsonUtil.array(eventJsons));
        System.out.println("✓ data/mission-events.json (" + events.size() + " events)");

        // ephemeris.json
        if (!ephemeris.isEmpty()) {
            List<String> ephJsons = new ArrayList<>();
            for (EphemerisClient.Row r : ephemeris) ephJsons.add(r.toJson());
            writeFile(OUT + "/ephemeris.json",
                "{\"startDate\":\"2024-01-01\","
                + "\"stopDate\":\"2029-01-01\","
                + "\"stepHours\":3,"
                + "\"rows\":" + JsonUtil.array(ephJsons)
                + ",\"provenance\":{"
                + "\"source\":\"JPL Horizons API\","
                + "\"method\":\"ephemeris-fetch\","
                + "\"url\":\"https://ssd.jpl.nasa.gov/api/horizons.api\","
                + "\"computedDate\":\"2026-11-14\""
                + "}}");
            System.out.println("✓ data/ephemeris.json (" + ephemeris.size() + " rows)");
        } else {
            System.out.println("⚠ data/ephemeris.json skipped (offline or fetch failed)");
        }

        System.out.println("\n═══════════════════════════════════════════");
        System.out.println("  Done. All JSON ready in data/");
        System.out.println("═══════════════════════════════════════════");
    }

    // ── Terrain helpers ────────────────────────────────────────

    /**
     * Fetch a DEM patch and compute the horizon profile.
     *
     * For sites poleward of 85°, geographic bboxes wrap the pole and
     * produce garbage. Use the polar stereographic DEM (native coords)
     * instead: the SPole45 service uses a stereographic projection
     * centred on the south pole with metres as units.
     *
     * Polar stereo formula (south pole):
     *   x = R * cos(lat) * sin(lon)  ... but for the actual Moon Trek
     *   projection the mapping is:
     *     x = R * tan(pi/4 + lat/2) * sin(lon)  [lat negative]
     *   We use a simpler approximation: at high latitudes, 1° lon ≈ very few km,
     *   so we fetch a fixed metric box from the EQ variant of the polar DEM,
     *   which accepts geographic coords but internally reprojects.
     *
     * Fallback: for sites between 45° and 85°, use the standard geographic fetch.
     */
    private static double[] fetchAndComputeHorizon(Site site) throws IOException {
        double halfKm = 20.0; // smaller patch to avoid pole-wrap issues
        int size = 500;

        if (Math.abs(site.lat) >= 85) {
            // Very near pole: use the _EQ variant which handles geographic coords
            // better, or fall back to a small patch
            halfKm = 10.0;
            size = 400;
        }

        double dlat = halfKm / 111.2;
        // Clamp cos(lat) to avoid extreme longitude spans near the pole
        double cosLat = Math.max(0.1, Math.cos(Math.toRadians(site.lat)));
        double dlon = halfKm / (111.32 * cosLat);

        // Clamp the bbox so it doesn't exceed ±90 lat or ±180 lon
        double latMin = Math.max(-89.99, site.lat - dlat);
        double latMax = Math.min(89.99, site.lat + dlat);
        double lonMin = site.lon - dlon;
        double lonMax = site.lon + dlon;
        // Longitude can wrap, but Moon Trek handles that poorly — clamp
        if (lonMin < -180) lonMin = -180;
        if (lonMax > 180) lonMax = 180;

        String service;
        if (site.lat <= -83) {
            // High-res geographic DEM for extreme south polar sites
            service = MoonTrekClient.DEM_SPOLE_HR;
        } else if (Math.abs(site.lat) >= 45) {
            service = MoonTrekClient.DEM_SPOLE;
        } else {
            service = MoonTrekClient.DEM_GLOBAL;
        }

        byte[] tiff = MoonTrekClient.fetchDemTiff(
            service, lonMin, latMin, lonMax, latMax, size, size
        );

        float[][] dem = MoonTrekClient.parseDemTiff(tiff, size, size);

        // Check for nodata / constant grids
        float center = dem[size/2][size/2];
        float min = center, max = center;
        for (int r = 0; r < dem.length; r += 10) {
            for (int c = 0; c < dem[0].length; c += 10) {
                if (dem[r][c] < min) min = dem[r][c];
                if (dem[r][c] > max) max = dem[r][c];
            }
        }
        double range = max - min;
        if (range < 1.0) {
            System.err.println("    [WARN] DEM patch is nearly flat (range="
                + range + "m) — horizon may be unreliable for " + site.name);
        }

        double dx = 2.0 * halfKm * 1000.0 / size; // metres per pixel

        return HorizonProfile.compute(dem, dx);
    }

    // ── I/O ────────────────────────────────────────────────────

    private static double clamp(double v, double lo, double hi) {
        return Math.min(hi, Math.max(lo, v));
    }

    private static void writeFile(String path, String content) throws IOException {
        try (Writer w = new BufferedWriter(new OutputStreamWriter(
                new FileOutputStream(path), "UTF-8"))) {
            w.write(content);
        }
    }
}
