package engine;

import java.util.List;

/**
 * Every tunable number. Balancing the game = editing this file, then running ./test-engine.sh.
 *
 * [REAL] = from a source in {@link Sources}.  [GAME] = chosen to make the game playable.
 * Time is measured in Earth hours.
 */
public final class Rules {

    // ---- Time ----
    /** [REAL] Blue Ghost Mission 1 had 346 hours of daylight at Mare Crisium. */
    public static final double DAY_HOURS = 346;
    /** [GAME] Rest of a ~29.5 Earth-day lunar cycle (708 h) is night. */
    public static final double NIGHT_HOURS = 362;
    /** Surviving this long (one full day and night) wins the game. */
    public static final double GAME_HOURS = DAY_HOURS + NIGHT_HOURS;
    /** [GAME] Simulation step. Big ticks are split into steps this size. */
    public static final double STEP_HOURS = 0.25;

    // ---- Power (battery 0–100) ----
    public static final double BATTERY_MAX = 100;
    /** [GAME] Charge per hour with the Sun overhead, clean panels, sunlight 1.0. */
    public static final double SOLAR_PER_HOUR = 5.0;
    /** [GAME] Extra drain per hour while the heater is on. */
    public static final double HEATER_PER_HOUR = 2.0;
    /** [GAME] A lander that tipped over (like IM-2) gets this share of normal solar charge. */
    public static final double TIPPED_SOLAR = 0.25;
    public static final double POWER_LOW = 25;
    public static final double POWER_CRITICAL = 10;

    // ---- Temperature (Kelvin) ----
    /** [GAME] Pets arrive warm from the lander (about room temperature). */
    public static final double START_TEMP_K = 293;
    /** [GAME] Share of the gap to the target temperature closed each hour. */
    public static final double THERMAL_RATE = 0.15;
    /** [GAME] How much warmer than the ground the heater keeps the pet. */
    public static final double HEATER_BOOST_K = 130;
    /** [GAME] How much the sunshade cools the pet in daylight. */
    public static final double SHADE_DROP_K = 130;
    /** [GAME] The sunshade also blocks part of the solar panel. */
    public static final double SHADE_SOLAR = 0.6;
    /** [GAME] Shape of the day's temperature curve; small = heats up fast after sunrise. */
    public static final double TEMP_CURVE = 0.25;

    // ---- Health (0–100) ----
    /** [GAME] Damage per hour for each Kelvin outside the pet's safe range. */
    public static final double DAMAGE_PER_K = 0.08;
    public static final double MAX_DAMAGE_PER_HOUR = 8;
    public static final double REGEN_PER_HOUR = 1;

    // ---- Dust (0–100, reduces solar charge and laser returns) ----
    /** [GAME] Dust kicked up by the landing. */
    public static final double LANDING_DUST = 15;
    public static final double DUST_PER_HOUR = 0.12;
    public static final double DUSTY = 60;

    // ---- Rover (Rover Run: a rover carries the pet between sites) ----
    /** [REAL] The Moon's volumetric mean radius, used for great-circle distances. */
    public static final double MOON_RADIUS_KM = 1737.4;
    /**
     * [REAL] Average driving speed of Apollo 17's rover: 35.9 km in 4 h 26 min of drive time (about 8.1 km/h).
     * [GAME] Real Apollo rovers never drove more than 20.1 km in one traverse; ours keeps going between sites.
     */
    public static final double ROVER_KMH = 35.9 / (4 + 26 / 60.0);
    /** [GAME] Driving kicks dust onto the panels on top of the normal settling rate. */
    public static final double DRIVE_DUST_PER_HOUR = 0.5;

    // ---- Science ----
    /** [REAL] LISTER measured at 8 depths down to 1 m. */
    public static final int LISTER_DEPTH_STOPS = 8;
    public static final double LISTER_MAX_DEPTH_M = 1.0;
    /** [REAL] LRO passes over each pole about every two hours: one laser ping chance per pass. */
    public static final double LRO_PASS_HOURS = 2;
    /** [GAME] Data the pet can hold before it must send home. */
    public static final double DATA_BUFFER_MAX = 100;

    // ---- Actions: power cost, cooldown (hours), effect ----
    public record ActionRule(String id, String label, double powerCost, double cooldownHours) {}

    public static final ActionRule HEATER = new ActionRule("heater", "Heater on/off", 0, 0);
    public static final ActionRule SHADE = new ActionRule("shade", "Sunshade on/off", 0, 0);
    public static final ActionRule CLEAN = new ActionRule("clean", "Shake off dust", 4, 8);
    public static final ActionRule SEND = new ActionRule("send", "Send data to Earth", 6, 4);
    public static final ActionRule DRILL = new ActionRule("work", "Drill deeper", 12, 24);
    public static final ActionRule DUST_TEST = new ActionRule("work", "Run a dust test", 5, 6);
    public static final ActionRule PING = new ActionRule("work", "Catch a laser ping", 0, LRO_PASS_HOURS);

    public static final double CLEAN_AMOUNT = 35;
    public static final double DRILL_DATA = 12;
    public static final double DUST_TEST_DATA = 6;
    public static final double DUST_TEST_CLEAN = 30;
    public static final double PING_DATA = 4;
    /** [GAME] The passive LRA can't shake itself; the lander does it rarely and for free. */
    public static final double PASSIVE_CLEAN_COOLDOWN = 24;

    // ---- Milestones: real missions to beat ----
    public record Milestone(String id, String mission, double hours, String text, String sourceId) {
        public String toJson() {
            return Json.obj("id", Json.q(id), "mission", Json.q(mission), "hours", Json.n(hours),
                    "text", Json.q(text), "sourceId", Json.q(sourceId));
        }
    }

    public static final List<Milestone> MILESTONES = List.of(
            new Milestone("im-2", "IM-2 (Athena)", 24,
                    "Outlasted IM-2, which tipped over and was declared dead the day after landing.", "sciam-bg1"),
            new Milestone("im-1", "IM-1 (Odysseus)", 7 * 24,
                    "Matched IM-1, which operated seven Earth days.", "sciam-bg1"),
            new Milestone("sunset", "Lunar day", DAY_HOURS,
                    "Survived all 346 hours of lunar daylight.", "firefly-bg1"),
            new Milestone("blue-ghost-1", "Blue Ghost Mission 1", DAY_HOURS + 5,
                    "Matched Blue Ghost 1, which kept working about 5 hours into the lunar night.", "firefly-bg1"));

    private Rules() {}
}
