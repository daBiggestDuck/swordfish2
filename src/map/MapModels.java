package map;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Immutable data records for the Lunar Map, CLPS Missions, Science Payloads, PSR Zones, and JPL Horizons Ephemeris.
 */
public final class MapModels {

    private MapModels() {}

    public record EphemerisSample(
            int index,
            String timestampUtc,
            double obsSubLon,
            double obsSubLat,
            double sunSubLon,
            double sunSubLat) {

        public Map<String, Object> toMap() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("index", index);
            m.put("timestampUtc", timestampUtc);
            m.put("obsSubLon", obsSubLon);
            m.put("obsSubLat", obsSubLat);
            m.put("sunSubLon", sunSubLon);
            m.put("sunSubLat", sunSubLat);
            return m;
        }
    }

    public record PsrZone(
            String id,
            String name,
            double centerLat,
            double centerLon,
            double areaKm2,
            double radiusKm,
            double divinerMaxTempK,
            double iceEvidenceScore,
            String notes,
            List<List<List<Double>>> rings) {

        public Map<String, Object> toMap() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", id);
            m.put("name", name);
            m.put("centerLat", centerLat);
            m.put("centerLon", centerLon);
            m.put("areaKm2", areaKm2);
            m.put("radiusKm", radiusKm);
            m.put("divinerMaxTempK", divinerMaxTempK);
            m.put("iceEvidenceScore", iceEvidenceScore);
            m.put("notes", notes);
            m.put("rings", rings);
            return m;
        }
    }

    public record LandingSite(
            String id,
            String name,
            String shortName,
            double lat,
            double lon,
            String region,
            double elevationMeters,
            double slopeDegrees,
            double roughnessIndex,
            String terrainSummary,
            String lightingCondition,
            double illuminationFlatPct,
            double illuminationTerrainPct,
            String illuminationMethod,
            String illuminationSource,
            double earthVisibilityPct,
            double divinerMinTempK,
            double divinerMaxTempK,
            double albedo,
            String scienceGoal,
            List<String> recommendedPayloadTypes,
            List<Double> horizonProfileDeg,
            String nearestPsrId,
            String nearestPsrName,
            double nearestPsrKm,
            Map<String, Double> decayMultipliers,
            String quickmapUrl,
            String trekUrl,
            String sourceUrl) {

        public Map<String, Object> toMap() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", id);
            m.put("name", name);
            m.put("shortName", shortName);
            m.put("lat", lat);
            m.put("lon", lon);
            m.put("region", region);
            m.put("elevationMeters", elevationMeters);
            m.put("slopeDegrees", slopeDegrees);
            m.put("roughnessIndex", roughnessIndex);
            m.put("terrainSummary", terrainSummary);
            m.put("lightingCondition", lightingCondition);
            m.put("illuminationFlatPct", illuminationFlatPct);
            m.put("illuminationTerrainPct", illuminationTerrainPct);
            m.put("illuminationMethod", illuminationMethod);
            m.put("illuminationSource", illuminationSource);
            m.put("earthVisibilityPct", earthVisibilityPct);
            m.put("divinerMinTempK", divinerMinTempK);
            m.put("divinerMaxTempK", divinerMaxTempK);
            m.put("albedo", albedo);
            m.put("scienceGoal", scienceGoal);
            m.put("recommendedPayloadTypes", recommendedPayloadTypes);
            m.put("horizonProfileDeg", horizonProfileDeg);
            m.put("nearestPsrId", nearestPsrId);
            m.put("nearestPsrName", nearestPsrName);
            m.put("nearestPsrKm", nearestPsrKm);
            m.put("decayMultipliers", decayMultipliers);
            m.put("quickmapUrl", quickmapUrl);
            m.put("trekUrl", trekUrl);
            m.put("sourceUrl", sourceUrl);
            return m;
        }
    }

    public record ClpsMission(
            String id,
            String name,
            String taskOrder,
            String vendor,
            int year,
            String launched,
            String landed,
            String status,
            String timeWindow,
            String siteId,
            String region,
            List<String> payloadIds,
            List<String> payloadTypes,
            List<String> dependsOn,
            String note,
            String sourceUrl) {

        public Map<String, Object> toMap() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", id);
            m.put("name", name);
            m.put("taskOrder", taskOrder);
            m.put("vendor", vendor);
            m.put("year", year);
            m.put("launched", launched);
            m.put("landed", landed);
            m.put("status", status);
            m.put("timeWindow", timeWindow);
            m.put("siteId", siteId);
            m.put("region", region);
            m.put("payloadIds", payloadIds);
            m.put("payloadTypes", payloadTypes);
            m.put("dependsOn", dependsOn);
            m.put("note", note);
            m.put("sourceUrl", sourceUrl);
            return m;
        }
    }

    public record PayloadInstrument(
            String id,
            String name,
            String fullName,
            String type,
            double massKg,
            double powerW,
            boolean isPassive,
            boolean requiresSun,
            boolean requiresDte,
            List<String> preferredRegions,
            String scienceGoal,
            String pdsUrl) {

        public Map<String, Object> toMap() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", id);
            m.put("name", name);
            m.put("fullName", fullName);
            m.put("type", type);
            m.put("massKg", massKg);
            m.put("powerW", powerW);
            m.put("isPassive", isPassive);
            m.put("requiresSun", requiresSun);
            m.put("requiresDte", requiresDte);
            m.put("preferredRegions", preferredRegions);
            m.put("scienceGoal", scienceGoal);
            m.put("pdsUrl", pdsUrl);
            return m;
        }
    }

    public record DatasetBundle(
            Map<String, Object> metadata,
            Map<String, Object> quickmapConfig,
            List<LandingSite> sites,
            List<ClpsMission> missions,
            List<PayloadInstrument> payloads,
            List<PsrZone> psrZones,
            List<EphemerisSample> ephemeris,
            List<Map<String, Object>> sources) {

        public Map<String, Object> toMap() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("metadata", metadata);
            m.put("quickmap", quickmapConfig);
            m.put("sites", sites.stream().map(LandingSite::toMap).toList());
            m.put("missions", missions.stream().map(ClpsMission::toMap).toList());
            m.put("payloads", payloads.stream().map(PayloadInstrument::toMap).toList());
            m.put("psrZones", psrZones.stream().map(PsrZone::toMap).toList());
            m.put("ephemerisCount", ephemeris.size());
            m.put("sources", sources);
            return m;
        }
    }
}
