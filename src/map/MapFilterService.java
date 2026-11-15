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

    private static final Map<String, String> SITE_ALIASES = Map.ofEntries(
            Map.entry("SHACKLETON_RIM", "SHACKLETON_RIM"),
            Map.entry("SHACKLETON_RIDGE", "SHACKLETON_RIM"),
            Map.entry("SHACKLETON-RIM", "SHACKLETON_RIM"),
            Map.entry("SHACKLETON-RIDGE", "SHACKLETON_RIM"),
            Map.entry("MARE_CRISIUM", "MARE_CRISIUM"),
            Map.entry("MARE-CRISIUM", "MARE_CRISIUM"),
            Map.entry("MALAPERT_A", "MALAPERT_A"),
            Map.entry("MALAPERT-A", "MALAPERT_A"),
            Map.entry("MONS_MOUTON", "MONS_MOUTON"),
            Map.entry("MONS-MOUTON", "MONS_MOUTON"),
            Map.entry("REINER_GAMMA", "REINER_GAMMA"),
            Map.entry("REINER-GAMMA", "REINER_GAMMA"),
            Map.entry("FAR_SIDE", "FAR_SIDE"),
            Map.entry("SCHRODINGER_BASIN", "FAR_SIDE"),
            Map.entry("SCHRODINGER-BASIN", "FAR_SIDE"),
            Map.entry("LUNAR_FARSIDE", "FAR_SIDE"),
            Map.entry("LUNAR-FARSIDE", "FAR_SIDE"),
            Map.entry("NOBILE_RIM", "MONS_MOUTON"),
            Map.entry("NOBILE_REGION", "MONS_MOUTON"),
            Map.entry("NOBILE-REGION", "MONS_MOUTON"),
            Map.entry("NOBILE", "MONS_MOUTON"),
            Map.entry("SOUTH_POLE_BO", "SHACKLETON_RIM"),
            Map.entry("SOUTH-POLE-BO", "SHACKLETON_RIM"),
            Map.entry("SOUTH_POLE_BG4", "SHACKLETON_RIM"),
            Map.entry("SOUTH-POLE-BG4", "SHACKLETON_RIM"),
            Map.entry("SOUTH_POLE_NOVAD", "SHACKLETON_RIM"),
            Map.entry("SOUTH-POLE-NOVAD", "SHACKLETON_RIM"),
            Map.entry("SINUS_VISCOSITATIS", "SINUS_VISCOSITATIS"),
            Map.entry("SINUS-VISCOSITATIS", "SINUS_VISCOSITATIS"),
            Map.entry("GRUITHUISEN_DOMES", "GRUITHUISEN_DOMES"),
            Map.entry("GRUITHUISEN-DOMES", "GRUITHUISEN_DOMES")
    );

    private static final Map<String, String> MISSION_ALIASES = Map.ofEntries(
            Map.entry("to2-ab", "peregrine-1"),
            Map.entry("to2-im", "im-1"),
            Map.entry("to19d", "blue-ghost-1"),
            Map.entry("to-prime1", "im-2"),
            Map.entry("ct-3", "blue-moon-1"),
            Map.entry("to20a", "griffin-1"),
            Map.entry("cp-11", "im-3"),
            Map.entry("cp-21", "blue-ghost-3"),
            Map.entry("cs-3", "blue-ghost-2"),
            Map.entry("cs-11", "draper-1"),
            Map.entry("cp-22", "im-4")
    );

    private static String normalizeRegion(String raw) {
        String upper = norm(raw);
        if (upper.isEmpty() || "ALL".equals(upper)) return upper;
        String canon = upper.replace('-', '_');
        return switch (canon) {
            case "NEARSIDE", "NEAR_SIDE" -> "NEAR_SIDE";
            case "POLAR", "SOUTHPOLE", "SOUTH_POLE" -> "SOUTH_POLE";
            case "FARSIDE", "FAR_SIDE" -> "FAR_SIDE";
            default -> canon;
        };
    }

    private static String normalizeStatus(String raw) {
        String upper = norm(raw);
        if (upper.isEmpty() || "ALL".equals(upper)) return upper;
        String canon = upper.replace('-', '_').replace(' ', '_');
        return switch (canon) {
            case "FAILED", "NO_LANDING" -> "NO_LANDING";
            case "LANDED" -> "LANDED";
            case "PLANNED" -> "PLANNED";
            default -> canon;
        };
    }

    public static String normalizeSiteId(String raw) {
        if (raw == null || raw.isBlank()) return "";
        String upper = raw.trim().toUpperCase(Locale.ROOT);
        if (SITE_ALIASES.containsKey(upper)) return SITE_ALIASES.get(upper);
        String underscored = upper.replace('-', '_');
        return SITE_ALIASES.getOrDefault(underscored, upper);
    }

    public static MapModels.LandingSite findSite(MapModels.DatasetBundle bundle, String siteId) {
        String canon = normalizeSiteId(siteId);
        if (canon.isEmpty()) return null;
        return bundle.sites().stream()
                .filter(s -> normalizeSiteId(s.id()).equals(canon) || s.id().equalsIgnoreCase(siteId.trim()))
                .findFirst()
                .orElse(null);
    }

    public static List<MapModels.ClpsMission> filterMissions(MapModels.DatasetBundle bundle, Map<String, String> params) {
        String timeWindow = norm(params.get("timeWindow"));
        String year = norm(params.get("year"));
        String region = normalizeRegion(params.get("region"));
        String status = normalizeStatus(params.get("status"));
        String payloadType = norm(params.get("payloadType"));
        String siteId = normalizeSiteId(params.getOrDefault("site", params.get("siteId")));
        String q = normLower(params.get("q"));

        List<MapModels.ClpsMission> out = new ArrayList<>();
        for (MapModels.ClpsMission m : bundle.missions()) {
            if (!isAll(timeWindow) && !timeWindow.equals(norm(m.timeWindow()))) continue;
            if (!isAll(year) && !year.equals(String.valueOf(m.year()))) continue;
            if (!isAll(region) && !region.equals(normalizeRegion(m.region()))) continue;
            if (!isAll(status) && !status.equals(normalizeStatus(m.status()))) continue;
            if (!isAll(siteId) && !siteId.equals(normalizeSiteId(m.siteId()))) continue;
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
        String region = normalizeRegion(params.get("region"));
        String status = normalizeStatus(params.get("status"));
        String payloadType = norm(params.get("payloadType"));
        String siteParam = normalizeSiteId(params.getOrDefault("site", params.get("siteId")));
        String q = normLower(params.get("q"));

        boolean hasMissionFilter = !isAll(timeWindow) || !isAll(year) || !isAll(status) || !isAll(payloadType);
        Set<String> missionMatchedSites = new HashSet<>();
        if (hasMissionFilter) {
            for (MapModels.ClpsMission m : filterMissions(bundle, params)) {
                if (m.siteId() != null && !m.siteId().isBlank()) {
                    missionMatchedSites.add(normalizeSiteId(m.siteId()));
                }
            }
        }

        List<MapModels.LandingSite> out = new ArrayList<>();
        for (MapModels.LandingSite s : bundle.sites()) {
            if (!isAll(region) && !region.equals(normalizeRegion(s.region()))) continue;
            if (!isAll(siteParam) && !siteParam.equals(normalizeSiteId(s.id()))) continue;
            if (hasMissionFilter && !missionMatchedSites.contains(normalizeSiteId(s.id()))) continue;
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
            MapModels.LandingSite found = findSite(bundle, id);
            if (found != null) chosen.add(found);
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
        String raw = normLower(failedMissionId);
        String aliased = MISSION_ALIASES.getOrDefault(raw, raw);
        MapModels.ClpsMission root = bundle.missions().stream()
                .filter(m -> m.id().equalsIgnoreCase(raw)
                        || m.id().equalsIgnoreCase(aliased)
                        || (m.taskOrder() != null && m.taskOrder().equalsIgnoreCase(raw)))
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
        MapModels.LandingSite foundSite = findSite(bundle, siteId);
        MapModels.LandingSite site = foundSite != null ? foundSite : bundle.sites().get(0);

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
