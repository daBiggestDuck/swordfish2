package data;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/**
 * One CLPS delivery contract. Dates and statuses extracted from
 * nasa.gov/commercial-lunar-payload-services and the official
 * CLPS timeline PDF (Jul 2025 rev).
 */
public class Mission {
    public final String id;           // stable id shared with the story branch (e.g. "blue-ghost-1")
    public final String taskOrder;    // official TO name
    public final String vendor;
    public final String lander;
    public final String siteId;       // FK → Site.id
    public final String launchDate;   // ISO or null
    public final String landingDate;  // ISO or null
    public final String status;       // "completed","landed","failed","in-transit","planned"
    public final String statusAsOf;   // ISO date
    public final int year;            // planned/actual year
    public final List<String> payloadIds;
    public final String sourceUrl;
    public final Provenance provenance;

    public Mission(String id, String taskOrder, String vendor, String lander,
                   String siteId, String launchDate, String landingDate,
                   String status, String statusAsOf, int year,
                   List<String> payloadIds, String sourceUrl,
                   Provenance provenance) {
        this.id = id;
        this.taskOrder = taskOrder;
        this.vendor = vendor;
        this.lander = lander;
        this.siteId = siteId;
        this.launchDate = launchDate;
        this.landingDate = landingDate;
        this.status = status;
        this.statusAsOf = statusAsOf;
        this.year = year;
        this.payloadIds = payloadIds;
        this.sourceUrl = sourceUrl;
        this.provenance = provenance;
    }

    public String toJson() {
        StringBuilder sb = new StringBuilder("{");
        sb.append("\"id\":").append(JsonUtil.quote(id)).append(",");
        sb.append("\"taskOrder\":").append(JsonUtil.quote(taskOrder)).append(",");
        sb.append("\"vendor\":").append(JsonUtil.quote(vendor)).append(",");
        sb.append("\"lander\":").append(JsonUtil.quote(lander)).append(",");
        sb.append("\"siteId\":").append(JsonUtil.quote(siteId)).append(",");
        sb.append("\"launchDate\":").append(JsonUtil.quote(launchDate)).append(",");
        sb.append("\"landingDate\":").append(JsonUtil.quote(landingDate)).append(",");
        sb.append("\"status\":").append(JsonUtil.quote(status)).append(",");
        sb.append("\"statusAsOf\":").append(JsonUtil.quote(statusAsOf)).append(",");
        sb.append("\"year\":").append(year).append(",");
        sb.append("\"payloadIds\":").append(JsonUtil.stringArray(payloadIds)).append(",");
        sb.append("\"sourceUrl\":").append(JsonUtil.quote(sourceUrl)).append(",");
        sb.append("\"provenance\":").append(provenance.toJson());
        sb.append("}");
        return sb.toString();
    }

    // ── Registry ──────────────────────────────────────────────

    private static final Provenance TIMELINE = new Provenance(
        "NASA CLPS Timeline PDF + delivery pages",
        "manual-extraction",
        "https://www.nasa.gov/wp-content/uploads/2025/07/clps-timeline-graphic-1.pdf",
        "2026-11-14"
    );

    private static List<String> ids(String... a) { return Arrays.asList(a); }

    public static List<Mission> all() {
        return Collections.unmodifiableList(Arrays.asList(

            // ── 2024 ──
            // Ids follow the story branch's Missions.java, which says
            // "keep the ids stable" — story, engine and map consumers
            // key on these. The official task order lives in `taskOrder`.
            new Mission("peregrine-1", "TO2-AB", "Astrobotic", "Peregrine",
                "SINUS_VISCOSITATIS", "2024-01-08", null,
                "failed", "2026-11-14", 2024,
                ids("nss","lets","nirvss","pitms","lra-peregrine"),
                "https://science.nasa.gov/lunar-science/clps-deliveries/to2-astrobotic/",
                TIMELINE),

            new Mission("im-1", "TO2-IM", "Intuitive Machines", "Nova-C (Odysseus)",
                "MALAPERT_A", "2024-02-15", "2024-02-22",
                "landed", "2026-11-14", 2024,
                ids("ln-1","scalpss-im1","rolses","ndl","rfmg","lra-im1"),
                "https://science.nasa.gov/lunar-science/clps-deliveries/to2-im/",
                TIMELINE),

            // ── 2025 ──
            new Mission("blue-ghost-1", "TO19D", "Firefly Aerospace", "Blue Ghost 1",
                "MARE_CRISIUM", "2025-01-15", "2025-03-02",
                "landed", "2026-11-14", 2025,
                ids("scalpss-bg1","rac","lms","radpc","lpv","lister",
                    "lexi","nglr","lra-bg1","stereo-bg1"),
                "https://science.nasa.gov/lunar-science/clps-deliveries/to19d-firefly/",
                TIMELINE),

            new Mission("im-2", "TO-PRIME1", "Intuitive Machines", "Nova-C (Athena)",
                "SHACKLETON_RIDGE", "2025-02-27", "2025-03-06",
                "landed", "2026-11-14", 2025,
                ids("msolo","lra-im2","micro-nova"),
                "https://science.nasa.gov/lunar-science/clps-deliveries/prime-1-im/",
                TIMELINE),

            // ── 2026 (planned per timeline) ──
            new Mission("griffin-1", "TO20A", "Astrobotic", "Griffin 1",
                "NOBILE_REGION", null, null,
                "planned", "2026-11-14", 2026,
                ids("trident","msolo-griffin","lra-griffin","nss-griffin"),
                "https://science.nasa.gov/lunar-science/clps-deliveries/to20a-astrobotic/",
                TIMELINE),

            new Mission("blue-moon-1", "CT-3", "Blue Origin", "Blue Moon MK1",
                "SOUTH_POLE_BO", null, null,
                "planned", "2026-11-14", 2026,
                ids(),
                "https://science.nasa.gov/lunar-science/clps-deliveries/ct-3-science/",
                TIMELINE),

            new Mission("blue-ghost-3", "CP-21", "Firefly Aerospace", "Blue Ghost 3",
                "GRUITHUISEN_DOMES", null, null,
                "planned", "2026-11-14", 2026,
                ids(),
                "https://science.nasa.gov/lunar-science/clps-deliveries/cp-21-science/",
                TIMELINE),

            new Mission("im-3", "CP-11", "Intuitive Machines", "Nova-C (IM-3)",
                "REINER_GAMMA", null, null,
                "planned", "2026-11-14", 2026,
                ids("lvx","cadre","mpac","lusem"),
                "https://science.nasa.gov/lunar-science/clps-deliveries/cp-11/",
                TIMELINE),

            // ── 2027 (planned per timeline) ──
            new Mission("blue-ghost-2", "CS-3/4", "Firefly Aerospace", "Blue Ghost 2",
                "FAR_SIDE", null, null,
                "planned", "2026-11-14", 2027,
                ids("lusee-night"),
                "https://science.nasa.gov/lunar-science/clps-deliveries/cs-3/",
                TIMELINE),

            new Mission("draper-1", "CS-11", "Draper", "SERIES-2",
                "SCHRODINGER_BASIN", null, null,
                "planned", "2026-11-14", 2027,
                ids(),
                "https://science.nasa.gov/lunar-science/clps-deliveries/cs-11/",
                TIMELINE),

            new Mission("im-4", "CP-22", "Intuitive Machines", "Nova-C (IM-4)",
                "MONS_MOUTON", null, null,
                "planned", "2026-11-14", 2027,
                ids(),
                "https://science.nasa.gov/lunar-science/clps-deliveries/cp-22-science/",
                TIMELINE),

            // ── 2028 (planned per timeline) ──
            // Not on the story branch's list yet; task-order ids kept.
            new Mission("cs-6", "CS-6", "Firefly Aerospace", "Blue Ghost 4",
                "SOUTH_POLE_BG4", null, null,
                "planned", "2026-11-14", 2028,
                ids(),
                "https://science.nasa.gov/lunar-science/programs/clps/cs-6-science/",
                TIMELINE),

            new Mission("ct-4", "CT-4", "Intuitive Machines", "Nova-D",
                "SOUTH_POLE_NOVAD", null, null,
                "planned", "2026-11-14", 2028,
                ids(),
                "https://science.nasa.gov/lunar-science/clps-deliveries/",
                TIMELINE),

            new Mission("cs-8", "CS-8", "TBD", "TBD",
                "SOUTH_POLE_BO", null, null,
                "planned", "2026-11-14", 2028,
                ids(),
                "https://science.nasa.gov/lunar-science/clps-deliveries/",
                TIMELINE),

            new Mission("cx-2", "CX-2", "TBD", "TBD",
                "SOUTH_POLE_BO", null, null,
                "planned", "2026-11-14", 2028,
                ids(),
                "https://science.nasa.gov/lunar-science/clps-deliveries/",
                TIMELINE)
        ));
    }
}
