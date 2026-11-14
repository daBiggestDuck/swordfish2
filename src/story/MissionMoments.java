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

            // ---- Pet: Ghost (Blue Ghost Mission 1, Firefly Aerospace) ----
            new MissionMoment("ghost-touchdown", "ANY", "Blue Ghost Mission 1",
                    "Touchdown!",
                    "Ghost is based on Firefly's Blue Ghost 1. Landing safely is the hardest part "
                            + "of any lunar mission, and your pet just did it!",
                    0.03, BG1_LANDING, Pets.BLUE_GHOST),
            new MissionMoment("ghost-payloads", "ANY", "Blue Ghost Mission 1",
                    "A backpack of experiments",
                    "The real Blue Ghost 1 carried 10 NASA instruments, and all 10 switched on and "
                            + "collected data on the Moon. Keep Ghost powered so they keep working!",
                    0.25, BG1_END, Pets.BLUE_GHOST),
            new MissionMoment("ghost-night", "ANY", "Blue Ghost Mission 1",
                    "Into the night",
                    "Blue Ghost 1 kept working through sunset and into the lunar night. "
                            + "Its mission ended on Mar. 16, 2025. Keep Ghost cozy!",
                    0.92, BG1_END, Pets.BLUE_GHOST),

            // ---- Pet: Luna (Blue Moon Mark 1, Blue Origin) ----
            new MissionMoment("luna-waiting", "ANY", "Blue Moon Mark 1 Mission",
                    "Still waiting for liftoff",
                    "Luna is based on Blue Origin's Blue Moon Mark 1, a planned CLPS delivery that "
                            + "will carry two NASA instruments to the Moon's south pole. "
                            + "This day is a practice run!",
                    0.03, CT3, Pets.BLUE_MOON),
            new MissionMoment("luna-cameras", "ANY", "Blue Moon Mark 1 Mission",
                    "Filming the landing",
                    "One of Luna's instruments, SCALPSS, uses cameras to film the lander and the "
                            + "ground during descent, to show how the engine plume disturbs the surface.",
                    0.30, CT3, Pets.BLUE_MOON),
            new MissionMoment("luna-learns", "ANY", "Earlier CLPS flights",
                    "Learning from friends",
                    "Earlier landers taught the whole program a lot: IM-1 landed tilted, "
                            + "Peregrine never landed, and Blue Ghost 1 worked through a lunar day. "
                            + "Luna gets to learn from all of them.",
                    0.50, DELIVERIES, Pets.BLUE_MOON),
            new MissionMoment("luna-mirror", "ANY", "Blue Moon Mark 1 Mission",
                    "A mirror for orbiters",
                    "Luna's other instrument is a laser retroreflector (LRA). "
                            + "It helps spacecraft in orbit pinpoint exactly where the lander is.",
                    0.70, CT3, Pets.BLUE_MOON),
            new MissionMoment("luna-night", "ANY", "Blue Moon Mark 1 Mission",
                    "Big dreams, long night",
                    "Every lander faces the cold lunar night. Luna dreams of the day it really "
                            + "flies. For now, keep it warm and the Earth link steady!",
                    0.92, CLPS_PAGE, Pets.BLUE_MOON)
    );

    private MissionMoments() {}
}
