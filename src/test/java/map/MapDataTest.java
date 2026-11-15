package map;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

/**
 * Pure-JDK verification suite for the NASA Lunar Map data pipeline, astronomy math,
 * raw file adaptation, and mission filtering.
 *
 * Run with JDK 17+:
 *   javac -d out src/map/*.java src/test/java/map/*.java
 *   java -cp out map.MapDataTest
 */
public final class MapDataTest {

    public static void main(String[] args) throws Exception {
        testRequiredFilesExist();
        testLoaderAndRawAdaptation();
        testLunarPhysicsAndHorizonMath();
        testFiltersAndCascadeAndRecipe();
        testArbitraryDropPointEvaluation();
        System.out.println("All Java MapDataTest checks passed.");
    }

    static void testRequiredFilesExist() throws Exception {
        Path mapsDir = Path.of("data", "maps");
        assertTrue(Files.isDirectory(mapsDir), "data/maps directory must exist");
        List<String> files = List.of(
                "NOTICE.md",
                "lunar_map_data.json",
                "raw/quickmap_lroc_stack3314.json",
                "raw/trek_clps_sites.json",
                "raw/trek_south_pole_psr.json",
                "raw/trek_lola_terrain_profiles.json",
                "raw/horizons_lunar_ephemeris.json"
        );
        for (String rel : files) {
            Path p = mapsDir.resolve(rel);
            assertTrue(Files.isRegularFile(p), "Missing map file: " + rel);
            assertTrue(Files.size(p) > 0, "Empty map file: " + rel);
        }
    }

    static void testLoaderAndRawAdaptation() throws Exception {
        MapModels.DatasetBundle bundle = MapDataLoader.defaultLoader().load();
        assertTrue(bundle.sites().size() >= 8, "Expected at least 8 landing sites");
        assertTrue(bundle.missions().size() >= 11, "Expected at least 11 CLPS missions");
        assertTrue(bundle.psrZones().size() >= 8, "Expected at least 8 PSR cold traps");
        assertTrue(bundle.ephemeris().size() == 178, "Expected 178 JPL Horizons ephemeris samples");

        assertTrue(MapFilterService.normalizeSiteId("SHACKLETON_RIDGE").equals("SHACKLETON_RIM"),
                "Site alias SHACKLETON_RIDGE must normalize to SHACKLETON_RIM");
        List<String> engineMeterKeys = List.of("power", "oxygen", "food", "happiness");
        for (MapModels.LandingSite site : bundle.sites()) {
            assertTrue(site.lat() >= -90.0 && site.lat() <= 90.0, "Valid latitude for " + site.id());
            assertTrue(site.lon() >= -180.0 && site.lon() <= 180.0, "Valid longitude for " + site.id());
            assertTrue(site.horizonProfileDeg().size() == 36, "Expected 36-bin LOLA horizon profile");
            assertTrue(site.decayMultipliers().keySet().size() == 4
                    && site.decayMultipliers().keySet().containsAll(engineMeterKeys),
                    "Site decayMultipliers must match engine METER_KEYS for " + site.id());
        }
    }

    static void testLunarPhysicsAndHorizonMath() throws Exception {
        MapModels.DatasetBundle bundle = MapDataLoader.defaultLoader().load();

        MapModels.LandingSite mareCrisium = bundle.sites().stream()
                .filter(s -> s.id().equals("MARE_CRISIUM")).findFirst().orElseThrow();
        MapModels.LandingSite farSide = bundle.sites().stream()
                .filter(s -> s.id().equals("FAR_SIDE")).findFirst().orElseThrow();
        MapModels.LandingSite shackleton = bundle.sites().stream()
                .filter(s -> s.id().equals("SHACKLETON_RIM")).findFirst().orElseThrow();

        Map<String, Object> mareSky = LunarMath.computeSiteSky(mareCrisium, bundle.ephemeris(), 141);
        Map<String, Object> farSky = LunarMath.computeSiteSky(farSide, bundle.ephemeris(), 141);
        Map<String, Object> shackletonSky = LunarMath.computeSiteSky(shackleton, bundle.ephemeris(), 141);

        assertTrue((boolean) mareSky.get("earthVisible"), "Mare Crisium must have direct Earth link");
        assertTrue(!(boolean) farSky.get("earthVisible"), "Far Side Schrodinger must have zero DTE link");
        @SuppressWarnings("unchecked")
        Map<String, Object> sWin = (Map<String, Object>) shackletonSky.get("windows");
        assertTrue(((Number) sWin.get("computedSunlitTerrainPct")).doubleValue() > 70.0,
                "Shackleton Rim terrain-aware sunlit % should reflect peak-of-eternal-light exposure");
    }

    static void testFiltersAndCascadeAndRecipe() throws Exception {
        MapModels.DatasetBundle bundle = MapDataLoader.defaultLoader().load();

        List<MapModels.ClpsMission> past = MapFilterService.filterMissions(bundle, Map.of("timeWindow", "PAST"));
        assertTrue(past.size() == 4, "Expected 4 past missions (Peregrine, IM-1, BG-1, IM-2)");

        List<MapModels.ClpsMission> year2026 = MapFilterService.filterMissions(bundle, Map.of("year", "2026"));
        assertTrue(year2026.size() == 4, "Expected 4 missions in 2026");

        List<MapModels.LandingSite> southPole = MapFilterService.filterSites(bundle, Map.of("region", "SOUTH_POLE"));
        assertTrue(southPole.size() == 3, "Expected 3 South Pole landing sites");

        Map<String, Object> cascade = MapFilterService.simulateCascade(bundle, "blue-ghost-2");
        assertTrue(((Number) cascade.get("impactCount")).intValue() >= 1,
                "Blue Ghost 2 failure must cascade to Draper Mission 1 relay dependency");

        Map<String, Object> recipe = MapFilterService.recommendRecipe(bundle, "MONS_MOUTON", 25.0, 90.0);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> recs = (List<Map<String, Object>>) recipe.get("recommended");
        assertTrue(!recs.isEmpty(), "Expected recommended payloads for Mons Mouton");
    }

    static void testArbitraryDropPointEvaluation() throws Exception {
        MapModels.DatasetBundle bundle = MapDataLoader.defaultLoader().load();

        Map<String, Object> nearKnown = LunarMath.evaluateDropPoint(bundle, 16.18, 59.10, 141);
        assertTrue((boolean) nearKnown.get("matchedKnownSite"), "Mare Crisium coords should match known site");

        Map<String, Object> farCustom = LunarMath.evaluateDropPoint(bundle, -42.5, 145.0, 141);
        assertTrue(!(boolean) farCustom.get("matchedKnownSite"), "Custom far-side point should not match known site");
        @SuppressWarnings("unchecked")
        Map<String, Object> farSky = (Map<String, Object>) farCustom.get("sky");
        assertTrue(!(boolean) farSky.get("earthVisible"), "Custom far-side point must have blocked DTE link");
        @SuppressWarnings("unchecked")
        List<String> warnings = (List<String>) farCustom.get("warnings");
        assertTrue(!warnings.isEmpty(), "Pre-drop evaluation must include environmental context warnings");
        @SuppressWarnings("unchecked")
        Map<String, Object> evalMult = (Map<String, Object>) farCustom.get("decayMultipliers");
        assertTrue(evalMult.keySet().size() == 4
                && evalMult.keySet().containsAll(List.of("power", "oxygen", "food", "happiness")),
                "evaluateDropPoint decayMultipliers must contain exact engine METER_KEYS");
    }

    private static void assertTrue(boolean cond, String message) {
        if (!cond) throw new AssertionError("Test failed: " + message);
    }
}
