package story;

import java.util.List;

/**
 * The pet roster. Two of the four story pets live here so far; the other two are for teammates:
 * add a {@link Pet} below, give it a missionId from {@link Missions}, and add its pop-ups in
 * {@link MissionMoments} with the same pet id.
 *
 * Facts checked against NASA pages (see the source links in MissionMoments).
 */
public final class Pets {

    public static final String BLUE_GHOST = "BLUE_GHOST";
    public static final String BLUE_MOON = "BLUE_MOON";

    public static final List<Pet> ALL = List.of(
            new Pet(BLUE_GHOST, "Ghost", "Firefly Aerospace", "blue-ghost-1", "👻",
                    "Brave and sunny. Based on Firefly's first Moon lander, which carried 10 NASA instruments.",
                    MissionMoments.MARE_CRISIUM, false,
                    List.of("Switched on all 10 NASA instruments and collected data on the Moon",
                            "Kept working through sunset and into the lunar night")),
            new Pet(BLUE_MOON, "Luna", "Blue Origin", "blue-moon-1", "🔵",
                    "Shy and curious. A planned delivery to the south pole that hasn't flown yet.",
                    MissionMoments.SHACKLETON_RIDGE, false,
                    List.of("Practiced caring for a lander that will film its own landing (SCALPSS)",
                            "Practiced for a mission carrying a mirror (LRA) so orbiters can find it")));

    public static Pet find(String id) {
        return ALL.stream().filter(p -> p.id().equals(id)).findFirst().orElse(ALL.get(0));
    }

    private Pets() {}
}
