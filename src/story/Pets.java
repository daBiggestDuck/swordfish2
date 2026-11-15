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
            new Pet(BLUE_GHOST, "Ghost", "Firefly Aerospace", "blue-ghost-1", "\uD83D\uDC7B",
                    "Brave and sunny. Based on Firefly's first Moon lander, which carried 10 NASA instruments.",
                    MissionMoments.MARE_CRISIUM, false,
                    List.of("Switched on all 10 NASA instruments and collected data on the Moon",
                            "Kept working through sunset and into the lunar night"),
                    null,
                    "The real Blue Ghost 1 landed on Mar. 2, 2025, ran all 10 NASA instruments, worked into "
                            + "the lunar night, and ended its mission on Mar. 16, 2025."),
            new Pet(BLUE_MOON, "Luna", "Blue Origin", "blue-moon-1", "\uD83D\uDD35",
                    "Shy and curious. A planned delivery to the south pole that hasn't flown yet.",
                    MissionMoments.SHACKLETON_RIDGE, false,
                    List.of("Practiced caring for a lander that will film its own landing (SCALPSS)",
                            "Practiced for a mission carrying a mirror (LRA) so orbiters can find it"),
                    null,
                    "The real Blue Moon Mark 1 has not flown yet. NASA lists it as a planned delivery to "
                            + "the Moon's south pole."),
            new Pet(TRIDDY, "Triddy", "Intuitive Machines", "im-2", "\u26CF\uFE0F",
                    "Hungry and determined. Based on TRIDENT, the ice drill that flew on IM-2 to Mons Mouton.",
                    MissionMoments.MONS_MOUTON, false,
                    List.of("Built to drill 1 meter down, bringing up soil about 10 cm at a time",
                            "Helped MSolo sniff the soil for signs of water ice"),
                    "TRIDENT drill",
                    "The real IM-2 lander ended up on its side near Mons Mouton on Mar. 6, 2025. "
                            + "MSolo still worked despite the rough landing."),
            new Pet(NODEY, "Nodey", "Intuitive Machines", "im-1", "\uD83D\uDCE1",
                    "Chatty and helpful. Based on LN-1, the navigation beacon that flew on IM-1 to Malapert A.",
                    MissionMoments.MALAPERT_A, false,
                    List.of("Lit a navigation beacon on the Moon for future explorers",
                            "Backed up its lander's own navigation system"),
                    "LN-1 navigation beacon",
                    "The real IM-1 lander came to rest tilted near Malapert A on Feb. 22, 2024. "
                            + "LN-1 still lit its beacon for 30 minutes in total."));

    /** Finds a pet by id, ignoring case ("trident" works too). Unknown ids give the first pet. */
    public static Pet find(String id) {
        return ALL.stream().filter(p -> p.id().equalsIgnoreCase(id)).findFirst().orElse(ALL.get(0));
    }

    private Pets() {}
}
