package story;

import java.util.List;

/**
 * Real-mission moments. Each cites the NASA page its facts came from; the dates in the timeline
 * graphic ("Timeline of Past and Future CLPS Deliveries") are in {@link Missions}.
 * Wonil's "data" branch may later take over the facts and sources.
 */
public final class MissionMoments {

    public static final String CLPS_PAGE = "https://www.nasa.gov/commercial-lunar-payload-services/";
    public static final String DELIVERIES = "https://science.nasa.gov/lunar-science/clps-deliveries/";
    public static final String BG1_LANDING =
            "https://www.nasa.gov/news-release/touchdown-carrying-nasa-science-fireflys-blue-ghost-lands-on-moon/";
    public static final String BG1_END =
            "https://www.nasa.gov/news-release/nasa-science-continues-after-fireflys-first-moon-mission-concludes/";
    public static final String BG1_ECLIPSE =
            "https://www.nasa.gov/blogs/missions/2025/03/14/nasa-science-data-received-blue-ghost-captures-eclipse-from-moon/";
    public static final String IM1_LRO =
            "https://www.nasa.gov/missions/lro/nasas-lro-images-intuitive-machines-odysseus-lander/";
    public static final String IM2_KIT =
            "https://www.nasa.gov/wp-content/uploads/2025/02/np-2025-02-005-jsc-clps-intuitive-machines-press-kit-508-2-25-25.pdf";
    public static final String PEREGRINE_KIT =
            "https://www.nasa.gov/wp-content/uploads/2023/12/np-2023-12-017-jsc-clps-astrobotic-press-kit-update-508.pdf";
    public static final String CT3 = "https://science.nasa.gov/lunar-science/clps-deliveries/ct-3-science/";
    public static final String LN1_BEACON =
            "https://www.nasa.gov/centers-and-facilities/marshall/nasa-lights-beacon-on-moon-with-autonomous-navigation-system-test/";
    public static final String IM1_PROGRESS =
            "https://www.nasa.gov/blogs/missions/2024/02/21/intuitive-machines-nasa-science-progress-toward-moon-landing/";

    // Site ids: keep in sync with SkyModel, the data branch (Wonil) and the map branch (Akshay).
    public static final String MARE_CRISIUM = "MARE_CRISIUM";
    public static final String MALAPERT_A = "MALAPERT_A";
    public static final String MONS_MOUTON = "MONS_MOUTON";
    public static final String REINER_GAMMA = "REINER_GAMMA";
    public static final String SHACKLETON_RIDGE = "SHACKLETON_RIDGE";

    public static final List<MissionMoment> ALL = List.of(
            // ---- Site stories (every pet) ----
            new MissionMoment("bg1-sunrise", MARE_CRISIUM, "Blue Ghost Mission 1",
                    "Hello, Mare Crisium!",
                    "Firefly's Blue Ghost 1 landed near Mons Latreille in Mare Crisium on Mar. 2, 2025, "
                            + "carrying 10 NASA instruments. Your pet is following in its footsteps.",
                    0.02, BG1_LANDING),
            new MissionMoment("bg1-eclipse", MARE_CRISIUM, "Blue Ghost Mission 1",
                    "An eclipse from the Moon",
                    "Blue Ghost 1 captured a total solar eclipse from the Moon's surface, "
                            + "when Earth passed in front of the Sun.",
                    0.65, BG1_ECLIPSE),
            new MissionMoment("bg1-sunset", MARE_CRISIUM, "Blue Ghost Mission 1",
                    "Sunset is coming",
                    "Blue Ghost 1's team planned to watch how lunar dust reacts to the Sun at dusk. "
                            + "The cold night is close, so keep your pet warm!",
                    0.88, BG1_LANDING),
            new MissionMoment("im1-tilt", MALAPERT_A, "IM-1 Mission",
                    "Wobbly landing",
                    "Intuitive Machines' IM-1 launched Feb. 15, 2024 and landed Feb. 22, 2024 near "
                            + "Malapert A, on ground sloped about 12 degrees, and came to rest tilted. "
                            + "Panel angle really matters!",
                    0.10, IM1_LRO),
            new MissionMoment("im2-mouton", MONS_MOUTON, "IM-2 Mission",
                    "Ice hunters",
                    "IM-2 launched Feb. 27, 2025 and landed Mar. 6, 2025, aiming for Mons Mouton near "
                            + "the Moon's south pole, where scientists look for water ice. "
                            + "Your pet is a tiny scientist too!",
                    0.10, IM2_KIT),
            new MissionMoment("reiner-gamma", REINER_GAMMA, "IM-3 Mission",
                    "A swirly mystery",
                    "IM-3 is a planned delivery. Reiner Gamma is famous for bright swirls on the "
                            + "surface, a great place to explore.",
                    0.10, DELIVERIES),
            new MissionMoment("shackleton", SHACKLETON_RIDGE, "Blue Moon Mark 1 Mission",
                    "At the very bottom",
                    "Shackleton Connecting Ridge is near the Moon's south pole. The Sun skims along "
                            + "the horizon here, so every bit of power counts.",
                    0.10, CT3),

            // ---- General stories (every pet, every site) ----
            new MissionMoment("peregrine-nolanding", "ANY", "Peregrine Mission One",
                    "Not every trip lands",
                    "Astrobotic's Peregrine launched Jan. 8, 2024 but never landed on the Moon. "
                            + "NASA says every failure brings lessons that improve the next mission.",
                    0.30, PEREGRINE_KIT),
            new MissionMoment("earth-link", "ANY", "Any CLPS lander",
                    "Calling Earth",
                    "Landers can only send data home when Earth is above the horizon and the "
                            + "antenna points right. Real operators wait for the link too.",
                    0.50, DELIVERIES),

            // ---- Pet: LISTER (heat-flow drill on Blue Ghost 1) ----
            new MissionMoment("lister-hello", "ANY", "Blue Ghost Mission 1",
                    "Meet LISTER",
                    "LISTER is a heat-flow probe that flew on Firefly's Blue Ghost 1. It drills into "
                            + "regolith to measure warmth from the Moon's interior — hungry work!",
                    0.03, BG1_LANDING, Pets.LISTER),
            new MissionMoment("lister-drill", "ANY", "Blue Ghost Mission 1",
                    "Drilling for heat",
                    "LISTER was designed to dig meters into the surface. Keep it powered: without "
                            + "solar (or lander) power, the drill gets too cold to work.",
                    0.30, BG1_END, Pets.LISTER),
            new MissionMoment("lister-night", "ANY", "Blue Ghost Mission 1",
                    "Into the night",
                    "Blue Ghost 1 kept science running through sunset. Active instruments like LISTER "
                            + "need power through the lunar night — huddle, don't sleep!",
                    0.92, BG1_END, Pets.LISTER),

            // ---- Pet: Retro (LRA laser retroreflector) ----
            new MissionMoment("retro-hello", "ANY", "IM-1 Mission",
                    "Meet Retro",
                    "Retro is based on the Laser Retroreflector Array — a handful of glass prisms "
                            + "that bounce laser light back to orbiters. No power, no commands.",
                    0.03, IM1_LRO, Pets.RETRO),
            new MissionMoment("retro-mirror", "ANY", "Any CLPS lander",
                    "A mirror for orbiters",
                    "Passive LRA arrays help spacecraft pinpoint exactly where a lander sits. "
                            + "They keep working for decades because they draw zero watts.",
                    0.40, CLPS_PAGE, Pets.RETRO),
            new MissionMoment("retro-night", "ANY", "Any CLPS lander",
                    "Sleep through the night",
                    "While powered pets huddle in the cold, Retro sleeps peacefully. Real hardware "
                            + "needs no heater and no battery — just clear glass facets.",
                    0.92, CLPS_PAGE, Pets.RETRO),

            // ---- Pet: EDS (electrodynamic dust shield on Blue Ghost 1) ----
            new MissionMoment("eds-hello", "ANY", "Blue Ghost Mission 1",
                    "Meet EDS",
                    "EDS is an electrodynamic dust shield from Blue Ghost 1. Electric fields lift "
                            + "lunar dust off glass and radiators — no moving parts.",
                    0.03, BG1_LANDING, Pets.EDS),
            new MissionMoment("eds-dust", "ANY", "Blue Ghost Mission 1",
                    "Dust everywhere",
                    "Lunar dust is electrostatically sticky. EDS cleans surfaces while the Sun "
                            + "(and lander power) can feed it; night stops the cleaning.",
                    0.35, BG1_END, Pets.EDS),
            new MissionMoment("eds-night", "ANY", "Blue Ghost Mission 1",
                    "Fields need power",
                    "Without power the dust shield cannot keep lifting motes. EDS huddles in the "
                            + "lunar night instead of sleeping — same rule as other active payloads.",
                    0.92, BG1_END, Pets.EDS),

            // ---- Pet: Nodey (LN-1 navigation beacon on IM-1) ----
            new MissionMoment("nodey-hello", "ANY", "IM-1 Mission",
                    "Meet Nodey",
                    "Nodey is based on Lunar Node-1 (LN-1), a navigation beacon NASA flew on IM-1. "
                            + "Its job: help explorers know exactly where they are on the Moon.",
                    0.03, LN1_BEACON, Pets.NODEY),
            new MissionMoment("nodey-dsn", "ANY", "IM-1 Mission",
                    "Talking to Earth",
                    "On the way to the Moon, LN-1 made three successful passes with NASA's Deep "
                            + "Space Network, talking with ground stations on Earth.",
                    0.25, IM1_PROGRESS, Pets.NODEY),
            new MissionMoment("nodey-backup", "ANY", "IM-1 Mission",
                    "Helping its lander",
                    "LN-1 also gave critical backup to IM-1's own navigation system. "
                            + "Nodey likes to help — and prefers waiting until Earth is in view!",
                    0.50, LN1_BEACON, Pets.NODEY),
            new MissionMoment("nodey-beacon", "ANY", "IM-1 Mission",
                    "A beacon on the Moon",
                    "For 30 minutes in total in February 2024, NASA lit a navigation beacon on the "
                            + "Moon with LN-1, testing a system that could guide future explorers.",
                    0.75, LN1_BEACON, Pets.NODEY)
    );

    private MissionMoments() {}
}
