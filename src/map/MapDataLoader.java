package map;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Loads consolidated map data and raw NASA files directly from data/maps/.
 * Automatically adapts new ArcGIS features from Moon Trek raw JSON and new ephemeris rows
 * from JPL Horizons $$SOE..$$EOE payloads when raw files are updated.
 */
public final class MapDataLoader {

    private final Path mapsRoot;

    public MapDataLoader(Path mapsRoot) {
        this.mapsRoot = mapsRoot.toAbsolutePath().normalize();
    }

    public static MapDataLoader defaultLoader() {
        return new MapDataLoader(Path.of("data", "maps"));
    }

    @SuppressWarnings("unchecked")
    public MapModels.DatasetBundle load() throws IOException {
        Map<String, Object> mainJson = readJsonObject(mapsRoot.resolve("lunar_map_data.json"));
        Map<String, Object> quickmapJson = readOptionalJsonObject(mapsRoot.resolve("raw").resolve("quickmap_lroc_stack3314.json"));
        Map<String, Object> trekSitesJson = readOptionalJsonObject(mapsRoot.resolve("raw").resolve("trek_clps_sites.json"));
        Map<String, Object> trekPsrJson = readOptionalJsonObject(mapsRoot.resolve("raw").resolve("trek_south_pole_psr.json"));
        Map<String, Object> lolaJson = readOptionalJsonObject(mapsRoot.resolve("raw").resolve("trek_lola_terrain_profiles.json"));
        Map<String, Object> horizonsJson = readOptionalJsonObject(mapsRoot.resolve("raw").resolve("horizons_lunar_ephemeris.json"));

        Map<String, Object> metadata = asMap(mainJson.get("metadata"));
        List<MapModels.PsrZone> psrZones = parsePsrZones(trekPsrJson);
        List<MapModels.EphemerisSample> ephemeris = parseHorizonsEphemeris(horizonsJson);
        Map<String, Map<String, Object>> lolaProfiles = parseLolaProfiles(lolaJson);

        List<MapModels.LandingSite> sites = loadAndAdaptSites(
                asListOfMaps(mainJson.get("sites")),
                trekSitesJson,
                lolaProfiles,
                psrZones,
                ephemeris
        );

        List<MapModels.ClpsMission> missions = parseMissions(asListOfMaps(mainJson.get("missions")));
        List<MapModels.PayloadInstrument> payloads = parsePayloads(asListOfMaps(mainJson.get("payloads")));
        List<Map<String, Object>> sources = asListOfMaps(mainJson.get("sources"));

        return new MapModels.DatasetBundle(
                metadata,
                quickmapJson,
                sites,
                missions,
                payloads,
                psrZones,
                ephemeris,
                sources
        );
    }

    public String readRawFile(String sourceKey) throws IOException {
        String filename = switch (sourceKey) {
            case "quickmap" -> "quickmap_lroc_stack3314.json";
            case "trek_sites" -> "trek_clps_sites.json";
            case "trek_psr" -> "trek_south_pole_psr.json";
            case "lola" -> "trek_lola_terrain_profiles.json";
            case "horizons" -> "horizons_lunar_ephemeris.json";
            default -> null;
        };
        if (filename == null) return null;
        Path p = mapsRoot.resolve("raw").resolve(filename).normalize();
        if (!p.startsWith(mapsRoot) || !Files.isRegularFile(p)) return null;
        return Files.readString(p, StandardCharsets.UTF_8);
    }

    private Map<String, Object> readJsonObject(Path path) throws IOException {
        String text = Files.readString(path, StandardCharsets.UTF_8);
        return JsonCodec.parseObject(text);
    }

    private Map<String, Object> readOptionalJsonObject(Path path) throws IOException {
        if (!Files.isRegularFile(path)) return Map.of();
        return readJsonObject(path);
    }

    @SuppressWarnings("unchecked")
    private List<MapModels.PsrZone> parsePsrZones(Map<String, Object> psrJson) {
        List<MapModels.PsrZone> zones = new ArrayList<>();
        List<Map<String, Object>> features = asListOfMaps(psrJson.get("features"));
        for (Map<String, Object> f : features) {
            Map<String, Object> attr = asMap(f.get("attributes"));
            Map<String, Object> geom = asMap(f.get("geometry"));
            List<List<List<Double>>> rings = new ArrayList<>();
            Object rawRings = geom.get("rings");
            if (rawRings instanceof List<?> outerList) {
                for (Object ringObj : outerList) {
                    if (ringObj instanceof List<?> ptList) {
                        List<List<Double>> ring = new ArrayList<>();
                        for (Object ptObj : ptList) {
                            if (ptObj instanceof List<?> xy && xy.size() >= 2) {
                                ring.add(List.of(asDouble(xy.get(0), 0.0), asDouble(xy.get(1), 0.0)));
                            }
                        }
                        rings.add(ring);
                    }
                }
            }
            zones.add(new MapModels.PsrZone(
                    asString(attr.get("PSR_ID"), "PSR_" + zones.size()),
                    asString(attr.get("Name"), "Unnamed PSR"),
                    asDouble(attr.get("CenterLat"), -89.0),
                    asDouble(attr.get("CenterLon"), 0.0),
                    asDouble(attr.get("AreaKm2"), 0.0),
                    asDouble(attr.get("RadiusKm"), 0.0),
                    asDouble(attr.get("DivinerMaxTempK"), 100.0),
                    asDouble(attr.get("IceEvidenceScore"), 0.5),
                    asString(attr.get("Notes"), ""),
                    rings
            ));
        }
        return zones;
    }

    private Map<String, Map<String, Object>> parseLolaProfiles(Map<String, Object> lolaJson) {
        Map<String, Map<String, Object>> out = new LinkedHashMap<>();
        Map<String, Object> profiles = asMap(lolaJson.get("profiles"));
        for (Map.Entry<String, Object> e : profiles.entrySet()) {
            out.put(e.getKey(), asMap(e.getValue()));
        }
        return out;
    }

    /**
     * Parses JPL Horizons CSV rows between $$SOE and $$EOE in raw horizons_lunar_ephemeris.json.
     */
    public static List<MapModels.EphemerisSample> parseHorizonsEphemeris(Map<String, Object> horizonsJson) {
        List<MapModels.EphemerisSample> samples = new ArrayList<>();
        String result = asString(horizonsJson.get("result"), "");
        if (result.isBlank()) return samples;

        int soe = result.indexOf("$$SOE");
        int eoe = result.indexOf("$$EOE");
        if (soe < 0 || eoe <= soe) return samples;

        String block = result.substring(soe + 5, eoe);
        String[] lines = block.split("\\R");
        int idx = 0;
        for (String rawLine : lines) {
            String line = rawLine.trim();
            if (line.isEmpty()) continue;
            String[] parts = line.split(",");
            if (parts.length < 7) continue;
            try {
                String dateStr = parts[0].trim();
                double obsLon = Double.parseDouble(parts[3].trim());
                double obsLat = Double.parseDouble(parts[4].trim());
                double sunLon = Double.parseDouble(parts[5].trim());
                double sunLat = Double.parseDouble(parts[6].trim());
                samples.add(new MapModels.EphemerisSample(idx++, dateStr, obsLon, obsLat, sunLon, sunLat));
            } catch (NumberFormatException ignored) {
                // Skip malformed or header lines cleanly
            }
        }
        return samples;
    }

    private List<MapModels.LandingSite> loadAndAdaptSites(
            List<Map<String, Object>> baseSites,
            Map<String, Object> trekSitesJson,
            Map<String, Map<String, Object>> lolaProfiles,
            List<MapModels.PsrZone> psrZones,
            List<MapModels.EphemerisSample> ephemeris) {

        Map<String, Map<String, Object>> mergedById = new LinkedHashMap<>();
        for (Map<String, Object> s : baseSites) {
            String id = asString(s.get("id"), "");
            if (!id.isEmpty()) mergedById.put(id, new LinkedHashMap<>(s));
        }

        // Adapt raw Moon Trek CLPS_sites features: update coordinates if matched, or append new sites!
        List<Map<String, Object>> trekFeatures = asListOfMaps(trekSitesJson.get("features"));
        for (Map<String, Object> f : trekFeatures) {
            Map<String, Object> attr = asMap(f.get("attributes"));
            Map<String, Object> geom = asMap(f.get("geometry"));
            String rawId = asString(attr.get("Site_ID"), "").trim();
            String siteName = asString(attr.get("Site_Name"), rawId);
            if (rawId.isEmpty()) {
                rawId = siteName.toUpperCase().replaceAll("[^A-Z0-9]+", "_");
            }
            double lon = asDouble(geom.get("x"), asDouble(attr.get("Longitude"), 0.0));
            double lat = asDouble(geom.get("y"), asDouble(attr.get("Latitude"), 0.0));

            Map<String, Object> target = mergedById.get(rawId);
            if (target == null) {
                target = new LinkedHashMap<>();
                target.put("id", rawId);
                target.put("name", siteName);
                target.put("shortName", siteName);
                target.put("region", asString(attr.get("Region"), inferRegion(lat, lon)));
                target.put("terrainSummary", "Adapted from Moon Trek CLPS_sites (" + asString(attr.get("Lander"), "CLPS") + ").");
                target.put("lightingCondition", Math.abs(lat) >= 75.0 ? "Polar Grazing" : "Lunar Day/Night Cycle");
                target.put("scienceGoal", "Lunar exploration target (" + asString(attr.get("Task_Order"), "CLPS") + ").");
                target.put("sourceUrl", asString(attr.get("URL"), "https://trek.nasa.gov/moon/"));
                mergedById.put(rawId, target);
            }
            target.put("lat", lat);
            target.put("lon", lon);
            if (attr.get("Region") != null) target.put("region", asString(attr.get("Region"), inferRegion(lat, lon)));
        }

        List<MapModels.LandingSite> result = new ArrayList<>();
        for (Map<String, Object> s : mergedById.values()) {
            String id = asString(s.get("id"), "");
            double lat = asDouble(s.get("lat"), 0.0);
            double lon = asDouble(s.get("lon"), 0.0);
            Map<String, Object> lola = lolaProfiles.getOrDefault(id, Map.of());

            List<Double> horizonBins = asDoubleList(lola.get("horizonProfileDeg"));
            if (horizonBins.isEmpty()) {
                horizonBins = defaultFlatHorizon();
            }

            double elevM = asDouble(lola.get("elevationMeters"), asDouble(s.get("elevationMeters"), 0.0));
            double slopeDeg = asDouble(lola.get("slopeDegrees"), asDouble(s.get("slopeDegrees"), 2.0));
            double roughness = asDouble(lola.get("roughnessIndex"), asDouble(s.get("roughnessIndex"), 0.2));
            double illumFlat = asDouble(lola.get("illuminationFlatPct"), asDouble(s.get("illuminationFlatPct"), 50.0));
            double illumTerrain = asDouble(lola.get("illuminationTerrainPct"), asDouble(s.get("illuminationTerrainPct"), 50.0));
            double minK = asDouble(lola.get("divinerMinTempK"), asDouble(s.get("divinerMinTempK"), 80.0));
            double maxK = asDouble(lola.get("divinerMaxTempK"), asDouble(s.get("divinerMaxTempK"), 360.0));
            double albedo = asDouble(lola.get("albedo"), asDouble(s.get("albedo"), 0.12));

            // Dynamically find nearest South Pole PSR from Moon Trek PSR_SP polygons
            String nearestPsrId = "";
            String nearestPsrName = asString(lola.get("nearestPsrName"), "None nearby");
            double nearestPsrKm = Double.MAX_VALUE;
            for (MapModels.PsrZone psr : psrZones) {
                double dist = LunarMath.greatCircleDistanceKm(lat, lon, psr.centerLat(), psr.centerLon());
                double edgeDist = Math.max(0.0, dist - psr.radiusKm());
                if (edgeDist < nearestPsrKm) {
                    nearestPsrKm = edgeDist;
                    nearestPsrId = psr.id();
                    nearestPsrName = psr.name();
                }
            }
            if (nearestPsrKm == Double.MAX_VALUE) nearestPsrKm = 0.0;

            String qUrl = asString(s.get("quickmapUrl"),
                    "https://quickmap.lroc.im-ldi.com/?extent=" + (lon - 5) + "," + (lat - 5) + "," + (lon + 5) + "," + (lat + 5) + "&proj=10&earthShadowEnabled=true&stack=3314");
            String tUrl = asString(s.get("trekUrl"),
                    "https://trek.nasa.gov/moon/#v=0.1&x=" + lon + "&y=" + lat + "&z=5&p=urn%3Aogc%3Adef%3Acrs%3AEPSG%3A%3A104903&b=moon");

            Map<String, Double> decayMap = new LinkedHashMap<>();
            Map<String, Object> rawDecay = asMap(s.get("decayMultipliers"));
            Map<String, Object> rawCare = asMap(s.get("careMultipliers"));
            decayMap.put("power", asDouble(rawDecay.get("power"), asDouble(rawCare.get("power"), 1.0)));
            decayMap.put("oxygen", asDouble(rawDecay.get("oxygen"), asDouble(rawDecay.get("warmth"), asDouble(rawCare.get("warmth"), 1.0))));
            decayMap.put("food", asDouble(rawDecay.get("food"), 1.0));
            decayMap.put("happiness", asDouble(rawDecay.get("happiness"), asDouble(rawDecay.get("signal"), asDouble(rawCare.get("signal"), 1.0))));

            double earthVis = asDouble(s.get("earthVisibilityPct"), Math.abs(lon) > 90.0 ? 0.0 : 100.0);
            if (!ephemeris.isEmpty()) {
                int dteOk = 0;
                for (MapModels.EphemerisSample ep : ephemeris) {
                    double eEl = LunarMath.elevationDeg(lat, lon, ep.obsSubLat(), ep.obsSubLon());
                    double eAz = LunarMath.azimuthDeg(lat, lon, ep.obsSubLat(), ep.obsSubLon());
                    double hEl = LunarMath.horizonElevationAtAzimuth(horizonBins, eAz);
                    if (eEl > hEl && eEl > -0.5) dteOk++;
                }
                earthVis = LunarMath.round1((dteOk * 100.0) / ephemeris.size());
            }

            result.add(new MapModels.LandingSite(
                    id,
                    asString(s.get("name"), id),
                    asString(s.get("shortName"), asString(s.get("name"), id)),
                    lat,
                    lon,
                    asString(s.get("region"), inferRegion(lat, lon)),
                    elevM,
                    slopeDeg,
                    roughness,
                    asString(lola.get("terrainType"), asString(s.get("terrainSummary"), "")),
                    asString(lola.get("lightingCondition"), asString(s.get("lightingCondition"), "")),
                    illumFlat,
                    illumTerrain,
                    asString(s.get("illuminationMethod"), "horizon-raycast"),
                    asString(s.get("illuminationSource"), "MOON_TREK:LOLA + JPL_HORIZONS:301"),
                    earthVis,
                    minK,
                    maxK,
                    albedo,
                    asString(s.get("scienceGoal"), ""),
                    asStringList(s.get("recommendedPayloadTypes")),
                    horizonBins,
                    nearestPsrId,
                    nearestPsrName,
                    LunarMath.round1(nearestPsrKm),
                    decayMap,
                    qUrl,
                    tUrl,
                    asString(s.get("sourceUrl"), "https://www.nasa.gov/commercial-lunar-payload-services/")
            ));
        }
        return result;
    }

    private List<MapModels.ClpsMission> parseMissions(List<Map<String, Object>> list) {
        List<MapModels.ClpsMission> out = new ArrayList<>();
        for (Map<String, Object> m : list) {
            out.add(new MapModels.ClpsMission(
                    asString(m.get("id"), ""),
                    asString(m.get("name"), ""),
                    asString(m.get("taskOrder"), ""),
                    asString(m.get("vendor"), ""),
                    (int) asDouble(m.get("year"), 2026),
                    asString(m.get("launched"), null),
                    asString(m.get("landed"), null),
                    asString(m.get("status"), "PLANNED"),
                    asString(m.get("timeWindow"), "UPCOMING"),
                    asString(m.get("siteId"), ""),
                    asString(m.get("region"), "NEAR_SIDE"),
                    asStringList(m.get("payloadIds")),
                    asStringList(m.get("payloadTypes")),
                    asStringList(m.get("dependsOn")),
                    asString(m.get("note"), ""),
                    asString(m.get("sourceUrl"), "")
            ));
        }
        return out;
    }

    private List<MapModels.PayloadInstrument> parsePayloads(List<Map<String, Object>> list) {
        List<MapModels.PayloadInstrument> out = new ArrayList<>();
        for (Map<String, Object> p : list) {
            out.add(new MapModels.PayloadInstrument(
                    asString(p.get("id"), ""),
                    asString(p.get("name"), ""),
                    asString(p.get("fullName"), ""),
                    asString(p.get("type"), ""),
                    asDouble(p.get("massKg"), 0.0),
                    asDouble(p.get("powerW"), 0.0),
                    Boolean.TRUE.equals(p.get("isPassive")),
                    Boolean.TRUE.equals(p.get("requiresSun")),
                    Boolean.TRUE.equals(p.get("requiresDte")),
                    asStringList(p.get("preferredRegions")),
                    asString(p.get("scienceGoal"), ""),
                    asString(p.get("pdsUrl"), "")
            ));
        }
        return out;
    }

    private static String inferRegion(double lat, double lon) {
        if (Math.abs(lon) > 90.0 && lat > -80.0) return "FAR_SIDE";
        if (lat <= -78.0) return "SOUTH_POLE";
        if (Math.abs(lon) > 90.0) return "FAR_SIDE";
        return "NEAR_SIDE";
    }

    private static List<Double> defaultFlatHorizon() {
        List<Double> bins = new ArrayList<>(36);
        for (int i = 0; i < 36; i++) bins.add(0.0);
        return bins;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> asMap(Object obj) {
        if (obj instanceof Map<?, ?> m) return (Map<String, Object>) m;
        return Map.of();
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> asListOfMaps(Object obj) {
        if (!(obj instanceof List<?> list)) return List.of();
        List<Map<String, Object>> out = new ArrayList<>();
        for (Object item : list) {
            if (item instanceof Map<?, ?> m) out.add((Map<String, Object>) m);
        }
        return out;
    }

    private static List<String> asStringList(Object obj) {
        if (!(obj instanceof List<?> list)) return List.of();
        List<String> out = new ArrayList<>();
        for (Object item : list) {
            if (item != null) out.add(String.valueOf(item));
        }
        return out;
    }

    private static List<Double> asDoubleList(Object obj) {
        if (!(obj instanceof List<?> list)) return List.of();
        List<Double> out = new ArrayList<>();
        for (Object item : list) {
            if (item instanceof Number n) out.add(n.doubleValue());
        }
        return out;
    }

    private static String asString(Object obj, String fallback) {
        return obj == null ? fallback : String.valueOf(obj);
    }

    private static double asDouble(Object obj, double fallback) {
        return obj instanceof Number n ? n.doubleValue() : fallback;
    }
}
