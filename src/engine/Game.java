package engine;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * One game: a payload pet at a landing site, from sunrise through the lunar night.
 *
 * The engine has no clock of its own. The caller (server or UI) calls {@link #tick(double)}
 * with how many game hours passed, and {@link #act(String)} when the player presses a button.
 * Both return the events that happened.
 *
 * Story hook: {@code storyEngine.advance(game.dayProgress())} every tick.
 */
public class Game {

    /** Result of a player action. {@code error} is null when it worked. */
    public record Result(boolean ok, String error, List<Event> events) {
        static Result fail(String error) {
            return new Result(false, error, List.of());
        }

        public String toJson() {
            return Json.obj("ok", Json.b(ok), "error", Json.q(error), "events", Json.array(events, Event::toJson));
        }
    }

    public final Pet pet;
    public final Site site;
    public final String petName;
    public final boolean tipped;

    private double hour = 0;
    private double health = 100;
    private double power = Rules.BATTERY_MAX;
    private double dust = Rules.LANDING_DUST;
    private double petTempK = Rules.START_TEMP_K;
    private double dataBuffer = 0;
    private double dataSent = 0;
    private int drillStops = 0;
    private int pings = 0;
    private boolean heaterOn = false;
    private boolean shadeOn = false;
    private boolean alive = true;
    private boolean won = false;
    private final Map<String, Double> cooldowns = new LinkedHashMap<>();
    private final Set<String> milestones = new LinkedHashSet<>();

    public Game(Pet pet, Site site, String petName, boolean tipped) {
        this.pet = pet;
        this.site = site;
        this.petName = petName == null || petName.isBlank() ? "Pip" : petName.strip();
        this.tipped = tipped;
    }

    public Game(Pet pet, Site site) {
        this(pet, site, null, false);
    }

    // ------------------------------------------------------------------ environment

    /** Surface temperature at this game hour, in Kelvin. */
    public double surfaceTempK(double atHour) {
        if (atHour >= Rules.DAY_HOURS) return site.nightMinK();
        double sun = sunElevation(atHour);
        return site.nightMinK() + (site.dayMaxK() - site.nightMinK()) * Math.pow(sun, Rules.TEMP_CURVE);
    }

    /** 0 at sunrise/sunset and all night, 1 at noon. */
    public static double sunElevation(double atHour) {
        if (atHour < 0 || atHour >= Rules.DAY_HOURS) return 0;
        return Math.sin(Math.PI * atHour / Rules.DAY_HOURS);
    }

    public boolean isDay() {
        return hour < Rules.DAY_HOURS;
    }

    /** 0.0 sunrise .. 1.0 sunset; stays 1.0 through the night. This is what StoryEngine.advance takes. */
    public double dayProgress() {
        return Math.min(1, hour / Rules.DAY_HOURS);
    }

    /** Solar charge per hour right now. */
    public double solarPerHour() {
        double charge = Rules.SOLAR_PER_HOUR * site.sunlight() * sunElevation(hour) * (1 - dust / 100);
        if (shadeOn) charge *= Rules.SHADE_SOLAR;
        if (tipped) charge *= Rules.TIPPED_SOLAR;
        return charge;
    }

    /** Temperature the pet is drifting toward right now. */
    public double targetTempK() {
        double t = surfaceTempK(hour);
        if (heaterOn) t += Rules.HEATER_BOOST_K;
        if (shadeOn && isDay()) t -= Rules.SHADE_DROP_K;
        return Math.max(0, t);
    }

    // ------------------------------------------------------------------ status

    /** "ok", "cold" or "hot" compared to the pet's safe range. */
    public String tempStatus() {
        if (petTempK < pet.minSafeK()) return "cold";
        if (petTempK > pet.maxSafeK()) return "hot";
        return "ok";
    }

    private boolean hasPower() {
        return pet.passive() || power > 0;
    }

    public String mood() {
        if (!alive) return "fainted";
        if (won) return "proud";
        if (tempStatus().equals("hot")) return "overheating";
        if (tempStatus().equals("cold")) return "freezing";
        if (!pet.passive() && power < Rules.POWER_CRITICAL) return "sleepy";
        if (dust >= Rules.DUSTY) return "dusty";
        if (!isDay()) return "night";
        return "happy";
    }

    // ------------------------------------------------------------------ time

    /** Advance the game by {@code hours}. Returns what happened. */
    public List<Event> tick(double hours) {
        List<Event> events = new ArrayList<>();
        if (!alive || won || hours <= 0) return events;
        String moodBefore = mood();
        double left = hours;
        while (left > 1e-9 && alive && !won) {
            double dt = Math.min(left, Rules.STEP_HOURS);
            step(dt, events);
            left -= dt;
        }
        addMoodChange(moodBefore, events);
        return events;
    }

    private void step(double dt, List<Event> events) {
        boolean wasDay = isDay();
        String tempBefore = tempStatus();
        double powerBefore = power;
        double dustBefore = dust;

        // Power
        if (!pet.passive()) {
            double drain = pet.drawPerHour() + (heaterOn ? Rules.HEATER_PER_HOUR : 0);
            power = clamp(power + (solarPerHour() - drain) * dt, 0, Rules.BATTERY_MAX);
            if (power <= 0 && heaterOn) {
                heaterOn = false;
                events.add(new Event("heaterOff", "out of power", hour + dt));
            }
        }

        // Dust
        dust = clamp(dust + Rules.DUST_PER_HOUR * dt, 0, 100);

        // Temperature drifts toward target
        petTempK += (targetTempK() - petTempK) * (1 - Math.exp(-Rules.THERMAL_RATE * dt));

        // Health
        double outside = Math.max(pet.minSafeK() - petTempK, petTempK - pet.maxSafeK());
        if (outside > 0) {
            health -= Math.min(Rules.MAX_DAMAGE_PER_HOUR, outside * Rules.DAMAGE_PER_K) * dt;
        } else if (hasPower()) {
            health += Rules.REGEN_PER_HOUR * dt;
        }
        health = clamp(health, 0, 100);

        // Cooldowns
        cooldowns.replaceAll((k, v) -> v - dt);
        cooldowns.values().removeIf(v -> v <= 1e-9);

        hour += dt;

        // Events
        if (!pet.passive()) powerEvents(powerBefore, power, events);
        String tempAfter = tempStatus();
        if (!tempAfter.equals(tempBefore)) {
            events.add(new Event(switch (tempAfter) {
                case "cold" -> "tooCold";
                case "hot" -> "tooHot";
                default -> "comfortable";
            }, Json.n(petTempK) + " K", hour));
        }
        if (dustBefore < Rules.DUSTY && dust >= Rules.DUSTY) events.add(new Event("dusty", null, hour));
        if (wasDay && !isDay()) events.add(new Event("sunset", null, hour));
        for (Rules.Milestone m : Rules.MILESTONES) {
            if (hour >= m.hours() && milestones.add(m.id())) events.add(new Event("milestone", m.id(), hour));
        }

        if (health <= 0) {
            alive = false;
            heaterOn = false;
            events.add(new Event("fainted", null, hour));
        } else if (hour >= Rules.GAME_HOURS) {
            won = true;
            events.add(new Event("won", null, hour));
        }
    }

    private void powerEvents(double before, double after, List<Event> events) {
        String a = powerLevel(before), b = powerLevel(after);
        if (a.equals(b)) return;
        if (b.equals("critical")) events.add(new Event("powerCritical", null, hour));
        else if (b.equals("low") && a.equals("ok")) events.add(new Event("powerLow", null, hour));
        else if (b.equals("ok")) events.add(new Event("powerRecovered", null, hour));
    }

    private static String powerLevel(double p) {
        if (p < Rules.POWER_CRITICAL) return "critical";
        if (p < Rules.POWER_LOW) return "low";
        return "ok";
    }

    // ------------------------------------------------------------------ actions

    /** Action ids available for this pet, in button order. */
    public List<String> actionIds() {
        return pet.passive() ? List.of("work", "clean") : List.of("work", "send", "clean", "heater", "shade");
    }

    public Rules.ActionRule rule(String actionId) {
        return switch (actionId) {
            case "heater" -> Rules.HEATER;
            case "shade" -> Rules.SHADE;
            case "clean" -> Rules.CLEAN;
            case "send" -> Rules.SEND;
            case "work" -> switch (pet.id()) {
                case "LISTER" -> Rules.DRILL;
                case "LRA" -> Rules.PING;
                case "LN-1" -> Rules.PING;
                default -> Rules.DUST_TEST;
            };
            default -> null;
        };
    }

    private double powerCost(String actionId) {
        return pet.passive() ? 0 : rule(actionId).powerCost();
    }

    private double cooldownFor(String actionId) {
        if (pet.passive() && actionId.equals("clean")) return Rules.PASSIVE_CLEAN_COOLDOWN;
        return rule(actionId).cooldownHours();
    }

    /** Why this action can't be done now, or null if it can. */
    public String whyNot(String actionId) {
        if (!alive) return petName + " has fainted";
        if (won) return "The game is over: you won!";
        if (!actionIds().contains(actionId)) return "Unknown action for " + pet.name() + ": " + actionId;
        if (cooldowns.containsKey(actionId)) return "Ready in " + Json.n(cooldowns.get(actionId)) + " h";
        boolean turningOff = (actionId.equals("heater") && heaterOn) || (actionId.equals("shade") && shadeOn);
        if (!turningOff && !hasPower()) return "No power. Wait for sunlight to recharge.";
        if (power < powerCost(actionId)) return "Needs " + Json.n(powerCost(actionId)) + " power";
        if (actionId.equals("work") && pet.id().equals("LISTER") && drillStops >= Rules.LISTER_DEPTH_STOPS)
            return "Already drilled to " + Rules.LISTER_MAX_DEPTH_M + " m";
        if (actionId.equals("work") && !pet.passive() && dataBuffer >= Rules.DATA_BUFFER_MAX)
            return "Data storage full. Send data to Earth first.";
        if (actionId.equals("send") && dataBuffer <= 0) return "No data to send yet";
        return null;
    }

    /** Do an action (button press). */
    public Result act(String actionId) {
        String error = whyNot(actionId);
        if (error != null) return Result.fail(error);

        String moodBefore = mood();
        List<Event> events = new ArrayList<>();
        double powerBefore = power;
        power -= powerCost(actionId);

        switch (actionId) {
            case "heater" -> {
                heaterOn = !heaterOn;
                events.add(new Event(heaterOn ? "heaterOn" : "heaterOff", null, hour));
            }
            case "shade" -> {
                shadeOn = !shadeOn;
                events.add(new Event(shadeOn ? "shadeOn" : "shadeOff", null, hour));
            }
            case "clean" -> {
                dust = Math.max(0, dust - Rules.CLEAN_AMOUNT);
                events.add(new Event("cleaned", Json.n(dust), hour));
            }
            case "send" -> {
                double amount = dataBuffer;
                dataSent += amount;
                dataBuffer = 0;
                events.add(new Event("dataSent", Json.n(amount), hour));
            }
            case "work" -> doWork(events);
            default -> throw new IllegalStateException(actionId);
        }

        double cd = cooldownFor(actionId);
        if (cd > 0) cooldowns.put(actionId, cd);
        if (!pet.passive()) powerEvents(powerBefore, power, events);
        addMoodChange(moodBefore, events);
        return new Result(true, null, events);
    }

    private void doWork(List<Event> events) {
        switch (pet.id()) {
            case "LISTER" -> {
                drillStops++;
                addData(Rules.DRILL_DATA);
                events.add(new Event("drilled", String.format(java.util.Locale.ROOT, "%.3f m", drillDepthM()), hour));
            }
            case "LRA", "LN-1" -> {
                // LRA: orbiter laser return. LN-1: ranging beacon ping.
                double got = Rules.PING_DATA * (1 - dust / 100);
                pings++;
                dataSent += got;
                events.add(new Event("ping", Json.n(got), hour));
            }
            default -> {
                addData(Rules.DUST_TEST_DATA);
                dust = Math.max(0, dust - Rules.DUST_TEST_CLEAN);
                events.add(new Event("dustTest", Json.n(dust), hour));
            }
        }
    }

    private void addData(double amount) {
        dataBuffer = Math.min(Rules.DATA_BUFFER_MAX, dataBuffer + amount);
    }

    private void addMoodChange(String before, List<Event> events) {
        String after = mood();
        if (!after.equals(before)) events.add(new Event("moodChanged", before + "->" + after, hour));
    }

    private static double clamp(double v, double lo, double hi) {
        return Math.max(lo, Math.min(hi, v));
    }

    // ------------------------------------------------------------------ getters

    public double hour() { return hour; }
    public double earthDays() { return hour / 24; }
    public double health() { return health; }
    public double power() { return pet.passive() ? Rules.BATTERY_MAX : power; }
    public double dust() { return dust; }
    public double petTempK() { return petTempK; }
    public double dataBuffer() { return dataBuffer; }
    public double dataSent() { return dataSent; }
    public double drillDepthM() { return drillStops * Rules.LISTER_MAX_DEPTH_M / Rules.LISTER_DEPTH_STOPS; }
    public int pings() { return pings; }
    public boolean heaterOn() { return heaterOn; }
    public boolean shadeOn() { return shadeOn; }
    public boolean alive() { return alive; }
    public boolean won() { return won; }
    public Set<String> milestones() { return Set.copyOf(milestones); }
    public Map<String, Double> cooldowns() { return Map.copyOf(cooldowns); }

    /** For tests: jump the clock without simulating. */
    void setHourForTest(double h) {
        this.hour = h;
    }

    /** For tests: make every action ready again. */
    void clearCooldownsForTest() {
        cooldowns.clear();
    }

    /** For tests: overwrite the meters. */
    void setForTest(double power, double dust, double petTempK) {
        this.power = power;
        this.dust = dust;
        this.petTempK = petTempK;
    }

    // ------------------------------------------------------------------ JSON

    public String toJson() {
        List<String> actions = new ArrayList<>();
        for (String id : actionIds()) {
            Rules.ActionRule r = rule(id);
            String label = switch (id) {
                case "heater" -> heaterOn ? "Heater: ON" : "Heater: off";
                case "shade" -> shadeOn ? "Sunshade: ON" : "Sunshade: off";
                default -> r.label();
            };
            actions.add(Json.obj("id", Json.q(id), "label", Json.q(label),
                    "powerCost", Json.n(powerCost(id)), "blockedBy", Json.q(whyNot(id))));
        }
        return Json.obj(
                "petName", Json.q(petName),
                "pet", pet.toJson(),
                "site", site.toJson(),
                "tipped", Json.b(tipped),
                "hour", Json.n(hour),
                "earthDays", Json.n(earthDays()),
                "dayProgress", Json.n(dayProgress()),
                "isDay", Json.b(isDay()),
                "sunElevation", Json.n(sunElevation(hour)),
                "surfaceTempK", Json.n(surfaceTempK(hour)),
                "petTempK", Json.n(petTempK),
                "tempStatus", Json.q(tempStatus()),
                "health", Json.n(health),
                "power", Json.n(power()),
                "solarPerHour", Json.n(solarPerHour()),
                "dust", Json.n(dust),
                "dataBuffer", Json.n(dataBuffer),
                "dataSent", Json.n(dataSent),
                "drillDepthM", Json.n(drillDepthM()),
                "pings", Integer.toString(pings),
                "heaterOn", Json.b(heaterOn),
                "shadeOn", Json.b(shadeOn),
                "alive", Json.b(alive),
                "won", Json.b(won),
                "mood", Json.q(mood()),
                "milestones", Json.array(milestones, Json::q),
                "actions", "[" + String.join(",", actions) + "]",
                "gameHours", Json.n(Rules.GAME_HOURS),
                "dayHours", Json.n(Rules.DAY_HOURS));
    }
}
