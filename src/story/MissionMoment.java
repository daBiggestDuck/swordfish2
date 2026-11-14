package story;

/**
 * One short, friendly pop-up tied to a real CLPS flight.
 *
 * @param id        unique key, used so a moment only fires once per game
 * @param siteId    landing site this moment belongs to, or "ANY" for every site
 * @param mission   real mission name (e.g. "Blue Ghost Mission 1")
 * @param title     pop-up headline
 * @param text      pop-up body (keep it short and kid-friendly)
 * @param dayStart  lunar-day progress (0.0 = sunrise, 1.0 = end of day) when it triggers
 * @param sourceUrl NASA page the fact comes from (shown on the Pet Passport)
 */
public record MissionMoment(
        String id,
        String siteId,
        String mission,
        String title,
        String text,
        double dayStart,
        String sourceUrl,
        String petId) {

    /** Moment for every pet. */
    public MissionMoment(String id, String siteId, String mission, String title,
                         String text, double dayStart, String sourceUrl) {
        this(id, siteId, mission, title, text, dayStart, sourceUrl, "ANY");
    }

    public boolean appliesTo(String site, String pet) {
        boolean siteOk = siteId.equals("ANY") || siteId.equalsIgnoreCase(site);
        boolean petOk = petId.equals("ANY") || petId.equalsIgnoreCase(pet);
        return siteOk && petOk;
    }

    public String toJson() {
        return "{\"id\":" + Json.q(id) + ",\"mission\":" + Json.q(mission) + ",\"title\":" + Json.q(title)
                + ",\"text\":" + Json.q(text) + ",\"dayStart\":" + dayStart
                + ",\"sourceUrl\":" + Json.q(sourceUrl) + "}";
    }
}
