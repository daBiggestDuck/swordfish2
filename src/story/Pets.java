package story;

import java.util.List;

/**
 * The four story pets, one per real CLPS mission (pets branch: Ariha and Pranav).
 *  - Ariha: Ghost (Blue Ghost Mission 1) and Luna (Blue Moon Mark 1).
 *  - Pranav: Triddy (TRIDENT drill on IM-2) and Nodey (LN-1 beacon on IM-1). Their ids match
 *    Pranav's catalog ("trident", "ln-1"); lookups ignore case.
 *
 * Facts checked against NASA pages (see the source links in MissionMoments).
 */
public final class Pets {

    public static final String BLUE_GHOST = "BLUE_GHOST";
    public static final String BLUE_MOON = "BLUE_MOON";
    public static final String TRIDDY = "TRIDENT";
    public static final String NODEY = "LN-1";

    public static final List<Pet> ALL = List.of(
            new Pet(BLUE_GHOST, "Ghost", "Firefly Aerospace", "blue-ghost-1", "👻",
                    "Brave and sunny. Based on Firefly's first Moon lander, which carried 10 NASA instruments.",
                    MissionMoments.MARE_CRISIUM, false,
                    List.of("Switched on all 10 NASA instruments and collected data on the Moon",
                            "Kept working through sunset and into the lunar night"),
                    null),
            new Pet(BLUE_MOON, "Luna", "Blue Origin", "blue-moon-1", "🔵",
                    "Shy and curious. A planned delivery to the south pole that hasn't flown yet.",
                    MissionMoments.SHACKLETON_RIDGE, false,
                    List.of("Practiced caring for a lander that will film its own landing (SCALPSS)",
                            "Practiced for a mission carrying a mirror (LRA) so orbiters can find it"),
                    null),
            new Pet(TRIDDY, "Triddy", "Intuitive Machines", "im-2", "⛏️",
                    "Hungry and determined. Based on TRIDENT, the ice drill that flew on IM-2 to Mons Mouton.",
                    MissionMoments.MONS_MOUTON, false,
                    List.of("Built to drill 1 meter down, bringing up soil about 10 cm at a time",
                            "Helped MSolo sniff the soil for signs of water ice"),
                    "TRIDENT drill"),
            new Pet(NODEY, "Nodey", "Intuitive Machines", "im-1", "📡",
                    "Chatty and helpful. Based on LN-1, the navigation beacon that flew on IM-1 to Malapert A.",
                    MissionMoments.MALAPERT_A, false,
                    List.of("Lit a navigation beacon on the Moon for future explorers",
                            "Backed up its lander's own navigation system"),
                    "LN-1 navigation beacon"));

    /** Finds a pet by id, ignoring case ("trident" works too). Unknown ids give the first pet. */
    public static Pet find(String id) {
        return ALL.stream().filter(p -> p.id().equalsIgnoreCase(id)).findFirst().orElse(ALL.get(0));
    }

    private Pets() {}
}
