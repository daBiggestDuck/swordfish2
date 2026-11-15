package data;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/**
 * Adoptable pet archetypes — exactly four real CLPS payload pets shipped in v0.
 * Canonical set (aligned with {@code catalog.json} pets + engine + story + js-pets):
 * {@code lister} (LISTER), {@code lra} (Retro), {@code eds} (EDS), {@code ln-1} (Nodey).
 * Other instruments still appear as mission payloads; they map onto these four
 * archetypes for power/game joins (see {@link Payload}).
 */
public class PetArchetype {
    public final String id;
    public final String displayName;
    public final String realInstrument;
    public final String emoji;
    public final boolean passive;
    public final double basePowerDraw;
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
            new PetArchetype("lister", "LISTER", "LISTER",
                "\uD83D\uDD29", false, 25.0,
                "Measure heat flowing from the Moon's interior",
                "Powers down — too cold to drill, needs heater to survive",
                "LISTER was designed by Honeybee Robotics to drill up to 3 metres into regolith"),
            new PetArchetype("lra", "Retro", "LRA",
                "\uD83D\uDCA0", true, 0.0,
                "Bounce laser light back to orbiting spacecraft for precise ranging",
                "Sleeps peacefully — passive optics need no power and work for decades",
                "The LRA is just 8 glass prisms in an aluminium hemisphere. No electronics, no power, works forever"),
            new PetArchetype("eds", "EDS", "EDS",
                "\u2728", false, 20.0,
                "Lift lunar dust off glass and radiators with electric fields",
                "Cold huddle — electrodynamic cleaning needs power through the lunar night",
                "EDS flew on Blue Ghost Mission 1. Electric fields move dust with no moving parts."),
            new PetArchetype("ln-1", "Nodey", "LN-1",
                "\uD83D\uDCE1", false, 18.0,
                "Broadcast ranging so later vehicles can find the landed asset",
                "Cold huddle — radio beacon still needs power; tutor prefers waiting for Earth",
                "LN-1 flew on IM-1 at Malapert A. Game engineDraw key ln1Draw ≈ 18; preferWait true.")
        ));
    }
}
