package story;

import java.util.List;

/**
 * The end-of-game keepsake: site, survival time, science sent home and NASA sources.
 *
 * @param petName      the player's name for their pet
 * @param instrument   real instrument the pet represents (e.g. "Laser Retroreflector Array")
 * @param siteName     landing site, e.g. "Mare Crisium"
 * @param daysSurvived Earth days survived (a lunar day is about 14)
 * @param science      what the pet "sent home", one line each
 * @param moments      mission moments the player saw (drives the source list)
 */
public record PetPassport(
        String petName,
        String instrument,
        String siteName,
        double daysSurvived,
        List<String> science,
        List<MissionMoment> moments) {

    public static final double LUNAR_DAY_EARTH_DAYS = 14.0;

    /** Convenience for the game: convert 0..1 lunar-day progress to Earth days. */
    public static double toEarthDays(double dayProgress) {
        return Math.max(0, Math.min(1, dayProgress)) * LUNAR_DAY_EARTH_DAYS;
    }

    public String rating() {
        if (daysSurvived >= LUNAR_DAY_EARTH_DAYS) return "Lunar Day Legend";
        if (daysSurvived >= 10) return "Seasoned Explorer";
        if (daysSurvived >= 5) return "Brave Rookie";
        return "Fresh Landing";
    }

    /** Distinct NASA source links from the moments the player saw. */
    public List<String> sources() {
        return moments.stream().map(MissionMoment::sourceUrl).distinct().toList();
    }

    public String toJson() {
        return "{\"petName\":" + Json.q(petName) + ",\"instrument\":" + Json.q(instrument)
                + ",\"siteName\":" + Json.q(siteName) + ",\"daysSurvived\":" + daysSurvived
                + ",\"lunarDayLength\":" + LUNAR_DAY_EARTH_DAYS + ",\"rating\":" + Json.q(rating())
                + ",\"science\":" + Json.array(science, Json::q)
                + ",\"moments\":" + Json.array(moments, m -> "{\"mission\":" + Json.q(m.mission())
                        + ",\"title\":" + Json.q(m.title()) + "}")
                + ",\"sources\":" + Json.array(sources(), Json::q) + "}";
    }

    /** Plain-text version, handy for tests and for copy/paste sharing. */
    public String toText() {
        StringBuilder sb = new StringBuilder();
        sb.append("=== PAYLOAD PETS PASSPORT ===\n");
        sb.append("Pet:        ").append(petName).append(" (").append(instrument).append(")\n");
        sb.append("Home:       ").append(siteName).append("\n");
        sb.append(String.format("Survived:   %.1f of %.0f Earth days  [%s]%n",
                daysSurvived, LUNAR_DAY_EARTH_DAYS, rating()));
        sb.append("Science sent home:\n");
        for (String s : science) sb.append("  - ").append(s).append('\n');
        sb.append("Real missions you met:\n");
        for (MissionMoment m : moments) sb.append("  - ").append(m.mission()).append(": ").append(m.title()).append('\n');
        sb.append("Learn more:\n");
        for (String url : sources()) sb.append("  ").append(url).append('\n');
        return sb.toString();
    }
}
