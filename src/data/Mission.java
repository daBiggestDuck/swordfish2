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
    public final String id;           // task-order slug
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
            new Mission("to2-ab", "TO2-AB", "Astrobotic", "Peregrine",
                "sinus-viscositatis", "2024-01-08", null,
                "failed", "2026-11-14", 2024,
                ids("nss","lets","nirvss","pitms","lra-peregrine"),
                "https://science.nasa.gov/lunar-science/clps-deliveries/to2-astrobotic/",
                TIMELINE),

            new Mission("to2-im", "TO2-IM", "Intuitive Machines", "Nova-C (Odysseus)",
                "malapert-a", "2024-02-15", "2024-02-22",
                "landed", "2026-11-14", 2024,
                ids("ln-1","scalpss-im1","rolses","ndl","rfmg","lra-im1"),
                "https://science.nasa.gov/lunar-science/clps-deliveries/to2-im/",
                TIMELINE),

            // ── 2025 ──
            new Mission("to19d", "TO19D", "Firefly Aerospace", "Blue Ghost 1",
                "mare-crisium", "2025-01-15", "2025-03-02",
                "landed", "2026-11-14", 2025,
                ids("scalpss-bg1","rac","lms","radpc","lpv","lister",
                    "lexi","moonlight","lra-bg1","stereo-bg1"),
                "https://science.nasa.gov/lunar-science/clps-deliveries/to19d-firefly/",
                TIMELINE),

            new Mission("to-prime1", "TO-PRIME1", "Intuitive Machines", "Nova-C (Athena)",
                "shackleton-ridge", "2025-02-27", "2025-03-06",
                "landed", "2026-11-14", 2025,
                ids("msolo","lra-im2","micro-nova"),
                "https://science.nasa.gov/lunar-science/clps-deliveries/prime-1-im/",
                TIMELINE),

            // ── 2026 (planned per timeline) ──
            new Mission("to20a", "TO20A", "Astrobotic", "Griffin 1",
                "nobile-region", null, null,
                "planned", "2026-11-14", 2026,
                ids("trident","msolo-griffin","lra-griffin","nss-griffin"),
                "https://science.nasa.gov/lunar-science/clps-deliveries/to20a-astrobotic/",
                TIMELINE),

            new Mission("ct-3", "CT-3", "Blue Origin", "Blue Moon MK1",
                "south-pole-bo", null, null,
                "planned", "2026-11-14", 2026,
                ids("ct3-payload-1","ct3-payload-2"),
                "https://science.nasa.gov/lunar-science/clps-deliveries/ct-3-science/",
                TIMELINE),

            new Mission("cp-21", "CP-21", "Firefly Aerospace", "Blue Ghost 3",
                "gruithuisen-domes", null, null,
                "planned", "2026-11-14", 2026,
                ids("cp21-p1","cp21-p2","cp21-p3","cp21-p4","cp21-p5","cp21-p6"),
                "https://science.nasa.gov/lunar-science/clps-deliveries/cp-21-science/",
                TIMELINE),

            new Mission("cp-11", "CP-11", "Intuitive Machines", "Nova-C (IM-3)",
                "reiner-gamma", null, null,
                "planned", "2026-11-14", 2026,
                ids("lusee-night","lra-im3","scalpss-im3","mag-im3"),
                "https://science.nasa.gov/lunar-science/clps-deliveries/cp-11/",
                TIMELINE),

            // ── 2027 (planned per timeline) ──
            new Mission("cs-3", "CS-3/4", "Firefly Aerospace", "Blue Ghost 2",
                "lunar-farside", null, null,
                "planned", "2026-11-14", 2027,
                ids("lusee-night-bg2","lra-bg2","relay-bg2"),
                "https://science.nasa.gov/lunar-science/clps-deliveries/cs-3/",
                TIMELINE),

            new Mission("cs-11", "CS-11", "TBD (Draper)", "SERIES-2",
                "schrodinger-basin", null, null,
                "planned", "2026-11-14", 2027,
                ids("cs11-p1","cs11-p2","cs11-p3"),
                "https://science.nasa.gov/lunar-science/clps-deliveries/cs-11/",
                TIMELINE),

            new Mission("cp-22", "CP-22", "Intuitive Machines", "Nova-C (IM-4)",
                "mons-mouton", null, null,
                "planned", "2026-11-14", 2027,
                ids("cp22-p1","cp22-p2","cp22-p3","cp22-p4","cp22-p5","cp22-p6"),
                "https://science.nasa.gov/lunar-science/clps-deliveries/cp-22-science/",
                TIMELINE),

            // ── 2028 (planned per timeline) ──
            new Mission("cs-6", "CS-6", "Firefly Aerospace", "Blue Ghost 4",
                "south-pole-bg4", null, null,
                "planned", "2026-11-14", 2028,
                ids("cs6-p1","cs6-p2","cs6-p3","cs6-p4"),
                "https://science.nasa.gov/lunar-science/programs/clps/cs-6-science/",
                TIMELINE),

            new Mission("ct-4", "CT-4", "Intuitive Machines", "Nova-D",
                "south-pole-novad", null, null,
                "planned", "2026-11-14", 2028,
                ids("ct4-p1","ct4-p2","ct4-p3","ct4-p4","ct4-p5","ct4-p6"),
                "https://science.nasa.gov/lunar-science/clps-deliveries/",
                TIMELINE),

            new Mission("cs-8", "CS-8", "TBD", "TBD",
                "south-pole-bo", null, null,
                "planned", "2026-11-14", 2028,
                ids(),
                "https://science.nasa.gov/lunar-science/clps-deliveries/",
                TIMELINE),

            new Mission("cx-2", "CX-2", "TBD", "TBD",
                "south-pole-bo", null, null,
                "planned", "2026-11-14", 2028,
                ids(),
                "https://science.nasa.gov/lunar-science/clps-deliveries/",
                TIMELINE)
        ));
    }
}
