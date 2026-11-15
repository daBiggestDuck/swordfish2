package story;

import java.util.List;

/**
 * The four story pets: the same four adoptable pets as the pets team (web/pets-3d on main):
 * LISTER, Retro, EDS and Nodey, with the same ids (lister, retro, eds, ln-1). Lookups ignore case,
 * and "LRA" (the engine's id) also finds Retro.
 */
public final class Pets {

    public static final String LISTER = "lister";
    public static final String RETRO = "retro";
    public static final String EDS = "eds";
    public static final String NODEY = "ln-1";

    public static final List<Pet> ALL = List.of(
            new Pet(LISTER, "LISTER", "Firefly Aerospace", "blue-ghost-1", "\u26CF\uFE0F",
                    "Curious digger. LISTER drilled into the Moon to measure the heat flowing out of it, riding on Blue Ghost 1.",
                    MissionMoments.MARE_CRISIUM, false,
                    List.of("Drilled into the Moon to measure heat flowing out of it",
                            "Worked through the lunar day on Blue Ghost 1"),
                    "LISTER heat-flow drill",
                    "Blue Ghost 1 landed on Mar. 2, 2025, ran all 10 NASA instruments including LISTER, "
                            + "worked into the lunar night, and ended its mission on Mar. 16, 2025."),
            new Pet(RETRO, "Retro", "Blue Origin", "blue-moon-1", "\uD83D\uDD35",
                    "Calm and patient. Retro is a laser retroreflector: just mirrors, so it needs no power and naps through the night.",
                    MissionMoments.SHACKLETON_RIDGE, true,
                    List.of("Bounced laser light back so orbiters can pinpoint the lander",
                            "Needed no power at all, even in the lunar night"),
                    "Laser retroreflector (LRA)",
                    "Retroreflectors have flown on earlier CLPS landers. Blue Moon Mark 1, a planned "
                            + "delivery to the south pole, will carry one too."),
            new Pet(EDS, "EDS", "Firefly Aerospace", "blue-ghost-1", "\uD83D\uDC7B",
                    "Neat and tidy. EDS is a dust shield that uses electric fields to push sticky Moon dust off surfaces.",
                    MissionMoments.MARE_CRISIUM, false,
                    List.of("Used electric fields to push Moon dust off its surfaces",
                            "Helped keep Blue Ghost 1's hardware clean"),
                    "Electrodynamic Dust Shield (EDS)",
                    "Blue Ghost 1 landed on Mar. 2, 2025 carrying EDS among its 10 NASA instruments, "
                            + "and all 10 switched on and collected data on the Moon."),
            new Pet(NODEY, "Nodey", "Intuitive Machines", "im-1", "\uD83D\uDCE1",
                    "Chatty and helpful. Nodey is LN-1, the navigation beacon that flew on IM-1 to Malapert A.",
                    MissionMoments.MALAPERT_A, false,
                    List.of("Lit a navigation beacon on the Moon for future explorers",
                            "Backed up its lander's own navigation system"),
                    "LN-1 navigation beacon",
                    "The real IM-1 lander came to rest tilted near Malapert A on Feb. 22, 2024. "
                            + "LN-1 still lit its beacon for 30 minutes in total."));

    /** Finds a pet by id, ignoring case ("trident" works too). Unknown ids give the first pet. */
    public static Pet find(String id) {
        String want = ("lra".equalsIgnoreCase(id) || "retroreflector".equalsIgnoreCase(id)) ? RETRO : id; // aliases
        return ALL.stream().filter(p -> p.id().equalsIgnoreCase(want)).findFirst().orElse(ALL.get(0));
    }

    private Pets() {}
}
