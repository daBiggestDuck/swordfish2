package data;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/**
 * Pet archetypes — each maps to a real CLPS instrument type.
 * Art, moods, and animations come from the pets branch.
 * This file defines the *data contract*: what fields the pet sprites
 * need, and what science traits each archetype carries.
 *
 * Game branches (engine / pets / ui) also use {@code catalog.json} pet ids
 * {@code trident} (Triddy) and {@code ln-1} (Nodey). Those ids must stay
 * aligned with the archetypes here so payload → pet joins do not collapse
 * TRIDENT into Digby or LN-1 into Shutterbug.
 */
public class PetArchetype {
    public final String id;
    public final String displayName;
    public final String realInstrument;
    public final String emoji;
    public final boolean passive;      // survives lunar night without power
    public final double basePowerDraw; // watts, 0 for passive
    public final String scienceGoal;
    public final String nightBehaviour;
    public final String funFact;

    public PetArchetype(String id, String displayName, String realInstrument,
                        String emoji, boolean passive, double basePowerDraw,
                        String scienceGoal, String nightBehaviour, String funFact) {
        this.id = id;
        this.displayName = displayName;
        this.realInstrument = realInstrument;
        this.emoji = emoji;
        this.passive = passive;
        this.basePowerDraw = basePowerDraw;
        this.scienceGoal = scienceGoal;
        this.nightBehaviour = nightBehaviour;
        this.funFact = funFact;
    }

    public String toJson() {
        return "{"
            + "\"id\":" + JsonUtil.quote(id) + ","
            + "\"displayName\":" + JsonUtil.quote(displayName) + ","
            + "\"realInstrument\":" + JsonUtil.quote(realInstrument) + ","
            + "\"emoji\":" + JsonUtil.quote(emoji) + ","
            + "\"passive\":" + passive + ","
            + "\"basePowerDraw\":" + JsonUtil.fmt(basePowerDraw, 1) + ","
            + "\"scienceGoal\":" + JsonUtil.quote(scienceGoal) + ","
            + "\"nightBehaviour\":" + JsonUtil.quote(nightBehaviour) + ","
            + "\"funFact\":" + JsonUtil.quote(funFact)
            + "}";
    }

    public static List<PetArchetype> all() {
        return Collections.unmodifiableList(Arrays.asList(

            new PetArchetype("lister", "Digby the Drill", "LISTER",
                "\uD83D\uDD29", // 🔩
                false, 25.0,
                "Measure heat flowing from the Moon's interior",
                "Powers down — too cold to drill, needs heater to survive",
                "LISTER was designed by Honeybee Robotics to drill up to 3 metres into regolith"),

            new PetArchetype("lra", "Retroflector Rex", "LRA",
                "\uD83D\uDCA0", // 💠
                true, 0.0,
                "Bounce laser light back to orbiting spacecraft for precise ranging",
                "Sleeps peacefully — passive optics need no power and work for decades",
                "The LRA is just 8 glass prisms in an aluminium hemisphere. No electronics, no power, works forever"),

            new PetArchetype("rac", "Dusty", "RAC",
                "\u2728", // ✨
                false, 5.0,
                "Test how lunar dust sticks to different materials",
                "Shivers in the cold — dust still clings to surfaces even at night",
                "Lunar dust is electrostatically charged and sticks to everything — "
                + "it was one of the biggest complaints from Apollo astronauts"),

            new PetArchetype("msolo", "Sniffer", "MSolo",
                "\uD83D\uDCA8", // 💨
                false, 40.0,
                "Detect water vapour and other volatiles at the surface",
                "Hibernates — the mass spectrometer needs significant power to ionise molecules",
                "MSolo flew on IM-2 to the south pole to sniff for water ice near Shackleton crater"),

            new PetArchetype("scalpss", "Shutterbug", "SCALPSS",
                "\uD83D\uDCF7", // 📷
                false, 15.0,
                "Film the landing plume and measure how it moves regolith",
                "Saves battery — cameras go to sleep mode but stay warm enough for the electronics",
                "SCALPSS uses camera technology from the Mars 2020 Perseverance rover"),

            new PetArchetype("planetvac", "Vacuumba", "Lunar PlanetVac",
                "\uD83E\uDEA8", // 🪨
                false, 20.0,
                "Capture regolith samples using pneumatic suction",
                "Locks down — the sample container seals to protect its precious cargo",
                "PlanetVac was originally tested on Mauna Kea, Hawai'i, using volcanic soil as a Moon stand-in"),

            // Game pets Triddy / Nodey (ids shared with catalog.json + engine/pets/ui)
            new PetArchetype("trident", "Triddy", "TRIDENT",
                "\uD83E\uDDCA", // ice cube emoji
                false, 34.0,
                "Drill and sample subsurface ice and regolith with MSOLO sniffing volatiles",
                "Cold huddle — rotary-percussive drill needs power through the lunar night",
                "TRIDENT flew on PRIME-1 (IM-2). Game engineDraw key tridentDraw ≈ 34 (hungrier than LISTER)."),

            new PetArchetype("ln-1", "Nodey", "LN-1",
                "\uD83D\uDCE1", // satellite antenna emoji
                false, 18.0,
                "Broadcast ranging so later vehicles can find the landed asset",
                "Cold huddle — radio beacon still needs power; tutor prefers waiting for Earth",
                "LN-1 flew on IM-1 at Malapert A. Game engineDraw key ln1Draw ≈ 18; preferWait true.")
        ));
    }
}
