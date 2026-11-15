package map;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Queue;
import java.util.Set;

/**
 * Filtering, multi-site comparison, LunarLink mission dependency cascade simulation,
 * and Regolith Recipe Box payload compatibility logic.
 */
public final class MapFilterService {

    private MapFilterService() {}

    public static List<MapModels.ClpsMission> filterMissions(MapModels.DatasetBundle bundle, Map<String, String> params) {
        String timeWindow = norm(params.get("timeWindow"));
        String year = norm(params.get("year"));
        String region = norm(params.get("region"));
        String status = norm(params.get("status"));
        String payloadType = norm(params.get("payloadType"));
        String siteId = norm(params.getOrDefault("site", params.get("siteId")));
        String q = normLower(params.get("q"));

        List<MapModels.ClpsMission> out = new ArrayList<>();
        for (MapModels.ClpsMission m : bundle.missions()) {
            if (!isAll(timeWindow) && !timeWindow.equals(norm(m.timeWindow()))) continue;
            if (!isAll(year) && !year.equals(String.valueOf(m.year()))) continue;
            if (!isAll(region) && !region.equals(norm(m.region()))) continue;
            if (!isAll(status) && !status.equals(norm(m.status()))) continue;
            if (!isAll(siteId) && !siteId.equals(norm(m.siteId()))) continue;
            if (!isAll(payloadType) && m.payloadTypes().stream().noneMatch(pt -> norm(pt).equals(payloadType))) continue;
            if (!q.isEmpty()) {
                String haystack = (m.name() + " " + m.vendor() + " " + m.taskOrder() + " " + m.note() + " " + m.siteId())
                        .toLowerCase(Locale.ROOT);
                if (!haystack.contains(q)) continue;
            }
            out.add(m);
        }
        return out;
    }

    public static List<MapModels.LandingSite> filterSites(MapModels.DatasetBundle bundle, Map<String, String> params) {
        String timeWindow = norm(params.get("timeWindow"));
        String year = norm(params.get("year"));
        String region = norm(params.get("region"));
        String status = norm(params.get("status"));
        String payloadType = norm(params.get("payloadType"));
        String q = normLower(params.get("q"));

        boolean hasMissionFilter = !isAll(timeWindow) || !isAll(year) || !isAll(status) || !isAll(payloadType);
        Set<String> missionMatchedSites = new HashSet<>();
        if (hasMissionFilter) {
            for (MapModels.ClpsMission m : filterMissions(bundle, params)) {
                if (m.siteId() != null && !m.siteId().isBlank()) {
                    missionMatchedSites.add(norm(m.siteId()));
                }
            }
        }

        List<MapModels.LandingSite> out = new ArrayList<>();
        for (MapModels.LandingSite s : bundle.sites()) {
            if (!isAll(region) && !region.equals(norm(s.region()))) continue;
            if (hasMissionFilter && !missionMatchedSites.contains(norm(s.id()))) continue;
            if (!q.isEmpty()) {
                String haystack = (s.id() + " " + s.name() + " " + s.terrainSummary() + " " + s.scienceGoal())
                        .toLowerCase(Locale.ROOT);
                if (!haystack.contains(q)) continue;
            }
            out.add(s);
        }
        return out;
    }

    public static Map<String, Object> compareSites(MapModels.DatasetBundle bundle, List<String> siteIds) {
        List<MapModels.LandingSite> chosen = new ArrayList<>();
        for (String id : siteIds) {
            bundle.sites().stream()
                    .filter(s -> s.id().equalsIgnoreCase(id.trim()))
                    .findFirst()
                    .ifPresent(chosen::add);
        }
        if (chosen.isEmpty()) {
            for (int i = 0; i < Math.min(3, bundle.sites().size()); i++) {
                chosen.add(bundle.sites().get(i));
            }
        }

        List<Map<String, Object>> columns = new ArrayList<>();
        for (MapModels.LandingSite s : chosen) {
            List<MapModels.ClpsMission> siteMissions = bundle.missions().stream()
                    .filter(m -> s.id().equalsIgnoreCase(m.siteId()))
                    .toList();
            Map<String, Object> col = new LinkedHashMap<>();
            col.put("id", s.id());
            col.put("name", s.name());
            col.put("region", s.region());
            col.put("lat", s.lat());
            col.put("lon", s.lon());
            col.put("elevationKm", LunarMath.round2(s.elevationMeters() / 1000.0));
            col.put("slopeDegrees", s.slopeDegrees());
            col.put("illuminationFlatPct", s.illuminationFlatPct());
            col.put("illuminationTerrainPct", s.illuminationTerrainPct());
            col.put("earthVisibilityPct", s.earthVisibilityPct());
            col.put("tempRangeK", Math.round(s.divinerMinTempK()) + "-" + Math.round(s.divinerMaxTempK()) + " K");
            col.put("nearestPsrName", s.nearestPsrName());
            col.put("nearestPsrKm", s.nearestPsrKm());
            col.put("lightingCondition", s.lightingCondition());
            col.put("missionCount", siteMissions.size());
            col.put("missions", siteMissions.stream().map(MapModels.ClpsMission::name).toList());
            col.put("scienceGoal", s.scienceGoal());
            col.put("source", s.illuminationSource());
            columns.add(col);
        }
        return Map.of("sites", columns, "count", columns.size());
    }

    /**
     * LunarLink "What-If" failure cascade simulator:
     * Given a failed mission id, discovers all downstream CLPS missions that depend on it.
     */
    public static Map<String, Object> simulateCascade(MapModels.DatasetBundle bundle, String failedMissionId) {
        MapModels.ClpsMission root = bundle.missions().stream()
                .filter(m -> m.id().equalsIgnoreCase(failedMissionId))
                .findFirst()
                .orElse(null);
        if (root == null) {
            return Map.of("error", "Unknown mission id", "missionId", failedMissionId);
        }

        Set<String> impactedIds = new HashSet<>();
        Queue<String> queue = new ArrayDeque<>();
        queue.add(root.id());

        while (!queue.isEmpty()) {
            String curr = queue.poll();
            for (MapModels.ClpsMission candidate : bundle.missions()) {
                if (candidate.dependsOn().stream().anyMatch(dep -> dep.equalsIgnoreCase(curr))) {
                    if (impactedIds.add(candidate.id())) {
                        queue.add(candidate.id());
                    }
                }
            }
        }

        List<Map<String, Object>> impacted = bundle.missions().stream()
                .filter(m -> impactedIds.contains(m.id()))
                .map(MapModels.ClpsMission::toMap)
                .toList();

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("failedMission", root.toMap());
        out.put("impactedMissions", impacted);
        out.put("impactCount", impacted.size());
        out.put("riskSummary", impacted.isEmpty()
                ? "No downstream CLPS missions directly depend on " + root.name() + "."
                : impacted.size() + " downstream mission(s) depend on technology, navigation, or relay capabilities from " + root.name() + ".");
        return out;
    }

    /**
     * Regolith Recipe Box: recommends payloads matching site science & lander mass/power budget.
     */
    public static Map<String, Object> recommendRecipe(MapModels.DatasetBundle bundle,
                                                      String siteId,
                                                      double maxMassKg,
                                                      double maxPowerW) {
        MapModels.LandingSite site = bundle.sites().stream()
                .filter(s -> s.id().equalsIgnoreCase(siteId))
                .findFirst()
                .orElse(bundle.sites().get(0));

        boolean siteHasDte = site.earthVisibilityPct() > 10.0;
        List<Map<String, Object>> matches = new ArrayList<>();
        List<Map<String, Object>> rejected = new ArrayList<>();

        for (MapModels.PayloadInstrument p : bundle.payloads()) {
            boolean fitsMass = p.massKg() <= maxMassKg;
            boolean fitsPower = p.powerW() <= maxPowerW;
            boolean regionMatch = p.preferredRegions().stream().anyMatch(r -> r.equalsIgnoreCase(site.region()));
            boolean typeMatch = site.recommendedPayloadTypes().stream().anyMatch(t -> t.equalsIgnoreCase(p.type()));

            List<String> reasons = new ArrayList<>();
            if (!fitsMass) reasons.add("Mass " + p.massKg() + " kg exceeds " + maxMassKg + " kg budget");
            if (!fitsPower) reasons.add("Power " + p.powerW() + " W exceeds " + maxPowerW + " W budget");
            if (p.requiresDte() && !siteHasDte && !site.region().equals("FAR_SIDE")) {
                reasons.add("Requires direct-to-Earth link");
            }

            boolean commsWarning = p.requiresDte() && !siteHasDte;
            int score = 0;
            if (fitsMass && fitsPower) score += 40;
            if (regionMatch) score += 30;
            if (typeMatch) score += 25;
            if (p.isPassive()) score += 5;
            if (commsWarning) score -= 25;

            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("payload", p.toMap());
            entry.put("score", Math.max(0, score));
            entry.put("fitsBudget", fitsMass && fitsPower);
            entry.put("scienceMatch", regionMatch || typeMatch);
            entry.put("commsWarning", commsWarning ? "Needs orbital relay at " + site.shortName() : null);

            if (fitsMass && fitsPower && (regionMatch || typeMatch || p.isPassive())) {
                String why = p.isPassive()
                        ? "Passive zero-power instrument — survives lunar night at " + site.shortName() + "."
                        : "Matches " + site.shortName() + " science profile (" + p.type().replace('_', ' ').toLowerCase(Locale.ROOT) + ").";
                if (commsWarning) why += " Requires Blue Ghost 2 orbital relay for data return.";
                entry.put("reason", why);
                matches.add(entry);
            } else {
                if (reasons.isEmpty()) reasons.add("Lower science priority for " + site.region() + " region.");
                entry.put("reason", String.join("; ", reasons));
                rejected.add(entry);
            }
        }

        matches.sort((a, b) -> Integer.compare((int) b.get("score"), (int) a.get("score")));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("siteId", site.id());
        out.put("siteName", site.name());
        out.put("scienceGoal", site.scienceGoal());
        out.put("maxMassKg", maxMassKg);
        out.put("maxPowerW", maxPowerW);
        out.put("recommended", matches);
        out.put("otherPayloads", rejected);
        return out;
    }

    private static String norm(String s) {
        return s == null ? "" : s.trim().toUpperCase(Locale.ROOT);
    }

    private static String normLower(String s) {
        return s == null ? "" : s.trim().toLowerCase(Locale.ROOT);
    }

    private static boolean isAll(String s) {
        return s.isEmpty() || "ALL".equals(s);
    }
}
