package story;

/**
 * One CLPS delivery. Data copied from NASA's "Timeline of Past and Future CLPS Deliveries" graphic.
 * Future missions are placed by year only and their order is not exact (per NASA's footnote),
 * so planned missions carry no dates here.
 *
 * @param siteId landing site id used by the story, or null when the story branch isn't sure
 */
public record Mission(
        String id,
        String name,
        String vendor,
        String launched,
        String landed,
        String status,
        String siteId,
        String note) {

    public static final String LANDED = "LANDED";
    public static final String NO_LANDING = "NO_LANDING";
    public static final String PLANNED = "PLANNED";

    public String toJson() {
        return "{\"id\":" + Json.q(id) + ",\"name\":" + Json.q(name) + ",\"vendor\":" + Json.q(vendor)
                + ",\"launched\":" + Json.q(launched) + ",\"landed\":" + Json.q(landed)
                + ",\"status\":" + Json.q(status) + ",\"siteId\":" + Json.q(siteId)
                + ",\"note\":" + Json.q(note) + "}";
    }
}
