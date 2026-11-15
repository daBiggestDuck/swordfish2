package data;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * A gameplay mission in the engine branch's exact shape
 * (see engine README "Data shapes (data branch)"):
 *
 *   { id, name, siteId, duration, requires, cost, reward }
 *
 * Everything is derived from the real CLPS payload manifest:
 *   - one gameplay mission per distinct instrument type at each site,
 *     named after the real instrument acronym that provides it;
 *   - power costs come from the instrument archetype's base power draw;
 *   - passive instruments (e.g. retroreflectors) cost no power and need
 *     no minimum meters — the real hardware needs no electricity;
 *   - failed missions are skipped (no surface science happened).
 *
 * Meters used: power and happiness only — the only engine meters that
 * map to real lunar data (illumination, Earth visibility, power draw).
 */
public class GameMission {
    public final String id;
    public final String name;
    public final String siteId;                     // FK → Site.id
    public final int duration;                      // seconds
    public final Map<String, Double> requires;      // minimum meters to start
    public final Map<String, Double> cost;          // applied at start
    public final Map<String, Double> reward;        // applied on completion

    public GameMission(String id, String name, String siteId, int duration,
                       Map<String, Double> requires, Map<String, Double> cost,
                       Map<String, Double> reward) {
        this.id = id;
        this.name = name;
        this.siteId = siteId;
        this.duration = duration;
        this.requires = requires;
        this.cost = cost;
        this.reward = reward;
    }

    public String toJson() {
        return "{"
            + "\"id\":" + JsonUtil.quote(id) + ","
            + "\"name\":" + JsonUtil.quote(name) + ","
            + "\"siteId\":" + JsonUtil.quote(siteId) + ","
            + "\"duration\":" + duration + ","
            + "\"requires\":" + meterObj(requires) + ","
            + "\"cost\":" + meterObj(cost) + ","
            + "\"reward\":" + meterObj(reward)
            + "}";
    }

    private static String meterObj(Map<String, Double> m) {
        StringBuilder sb = new StringBuilder("{");
        boolean first = true;
        for (Map.Entry<String, Double> e : m.entrySet()) {
            if (!first) sb.append(",");
            first = false;
            sb.append("\"").append(e.getKey()).append("\":").append(e.getValue().intValue());
        }
        return sb.append("}").toString();
    }

    /** Short activity label per instrument type. */
    private static String label(String type) {
        switch (type) {
            case "camera":        return "Surface Imaging";
            case "drill":         return "Heat-Flow Drilling";
            case "retroreflector":return "Laser Ranging";
            case "spectrometer":  return "Composition Survey";
            case "nav":           return "Autonomous Navigation";
            case "sampler":       return "Regolith Sampling";
            case "radio":         return "Radio Experiment";
            case "computer":      return "Rad-Hard Compute Test";
            case "gauge":         return "Tank Gauging";
            default:              return "Instrument Run";
        }
    }

    /**
     * Build the full gameplay-mission list from the real manifest.
     *
     * @param missions   CLPS deliveries (missionId → siteId, status)
     * @param payloads   real instruments, grouped by missionId
     * @param archetypes pet archetypes, for base power draw per instrument
     */
    public static List<GameMission> all(List<Mission> missions, List<Payload> payloads,
                                        List<PetArchetype> archetypes) {
        Map<String, String> siteOf = new HashMap<>();
        Set<String> failed = new LinkedHashSet<>();
        for (Mission m : missions) {
            if (m.siteId != null) siteOf.put(m.id, m.siteId);
            if ("failed".equals(m.status)) failed.add(m.id);
        }
        Map<String, Double> powerOf = new HashMap<>();
        for (PetArchetype a : archetypes) powerOf.put(a.id, a.basePowerDraw);

        // payload type → acronym per mission, deduplicated, manifest order
        Map<String, Map<String, String>> firstAcroPerType = new HashMap<>();
        Map<String, Map<String, String>> petOf = new HashMap<>();
        for (Payload p : payloads) {
            if (failed.contains(p.missionId) || !siteOf.containsKey(p.missionId)) continue;
            Map<String, String> acro = firstAcroPerType.computeIfAbsent(p.missionId, k -> new HashMap<>());
            Map<String, String> pets = petOf.computeIfAbsent(p.missionId, k -> new HashMap<>());
            if (!acro.containsKey(p.type)) {
                acro.put(p.type, p.acronym);
                pets.put(p.type, p.petArchetype);
            }
        }

        List<GameMission> out = new ArrayList<>();
        for (Mission m : missions) {
            Map<String, String> acro = firstAcroPerType.get(m.id);
            if (acro == null) continue; // failed, or no published payloads
            for (Map.Entry<String, String> e : acro.entrySet()) {
                String type = e.getKey();
                String petId = petOf.get(m.id).get(type);
                boolean passive = powerOf.getOrDefault(petId, 0.0) <= 0.0;

                Map<String, Double> requires = new HashMap<>();
                Map<String, Double> cost = new HashMap<>();
                Map<String, Double> reward = new HashMap<>();
                if (passive) {
                    reward.put("happiness", 15.0);
                } else {
                    double draw = powerOf.getOrDefault(petId, 25.0);
                    requires.put("power", 40.0);
                    cost.put("power", -(double) Math.round(draw * 0.8));
                    reward.put("happiness", 25.0);
                    reward.put("food", 10.0);
                }
                out.add(new GameMission(
                    m.id + "-" + type,
                    e.getValue() + " " + label(type),
                    m.siteId,
                    passive ? 60 : 120,
                    requires, cost, reward));
            }
        }
        return out;
    }
}
