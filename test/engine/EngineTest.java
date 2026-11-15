package engine;

import java.util.ArrayList;
import java.util.List;

/**
 * Engine tests plus a balance report. No libraries: run with ./test-engine.sh
 * Exits with code 1 if any test fails.
 */
public class EngineTest {

    private static int passed = 0;
    private static final List<String> failures = new ArrayList<>();

    static final Site CRISIUM = Sites.byId("MARE_CRISIUM").orElseThrow();
    static final Site MOUTON = Sites.byId("MONS_MOUTON").orElseThrow();
    static final Site SHADOW = Sites.byId("SHADOWED_CRATER").orElseThrow();
    static final Site MALAPERT = Sites.byId("MALAPERT_A").orElseThrow();
    static final Pet LISTER = Pet.byId("LISTER").orElseThrow();
    static final Pet LRA = Pet.byId("LRA").orElseThrow();
    static final Pet EDS = Pet.byId("EDS").orElseThrow();

    public static void main(String[] args) {
        test("new game starts full and alive", () -> {
            Game g = new Game(LISTER, CRISIUM);
            check(g.alive() && !g.won(), "alive");
            eq(g.health(), 100, "health");
            eq(g.power(), Rules.BATTERY_MAX, "power");
            eq(g.dust(), Rules.LANDING_DUST, "dust");
            eq(g.dayProgress(), 0, "dayProgress");
        });

        test("surface temperature follows real Diviner numbers", () -> {
            Game g = new Game(LISTER, CRISIUM);
            eq(g.surfaceTempK(Rules.DAY_HOURS / 2), 400, "equator noon ~400 K");
            eq(g.surfaceTempK(Rules.DAY_HOURS + 10), 95, "equator night below 100 K");
            Game s = new Game(LRA, SHADOW);
            check(s.surfaceTempK(Rules.DAY_HOURS / 2) <= 40, "shadowed crater stays at 40 K or colder");
            eq(s.surfaceTempK(Rules.DAY_HOURS + 1), 25, "shadowed crater night 25 K");
        });

        test("day lasts 346 hours and dayProgress feeds the story", () -> {
            Game g = new Game(LRA, CRISIUM);
            g.tick(Rules.DAY_HOURS / 2);
            eq(g.dayProgress(), 0.5, "half day");
            List<Event> ev = g.tick(Rules.DAY_HOURS / 2 + 1);
            check(has(ev, "sunset"), "sunset event");
            eq(g.dayProgress(), 1, "night stays at 1.0");
        });

        test("LRA needs no power: survives a full day and night untouched, everywhere", () -> {
            for (Site site : Sites.ALL) {
                Game g = new Game(LRA, site);
                List<Event> ev = g.tick(Rules.GAME_HOURS + 1);
                check(g.won() && g.alive(), "LRA should win at " + site.id());
                eq(g.power(), Rules.BATTERY_MAX, "passive power");
                eq(count(ev, "milestone"), Rules.MILESTONES.size(), "each milestone once at " + site.id());
            }
        });

        test("a neglected LISTER does not survive Mare Crisium", () -> {
            Game g = new Game(LISTER, CRISIUM);
            List<Event> ev = g.tick(Rules.GAME_HOURS);
            check(!g.alive(), "should faint");
            eq(count(ev, "fainted"), 1, "fainted once");
            check(g.act("work").error() != null, "no actions after fainting");
            eq(g.tick(10).size(), 0, "no events after fainting");
        });

        test("LISTER can't live in a permanently shadowed crater", () -> {
            Game g = new Game(LISTER, SHADOW);
            g.tick(200);
            check(!g.alive(), "should freeze");
        });

        test("drilling: 8 stops to 1 m, then blocked", () -> {
            Game g = new Game(LISTER, CRISIUM);
            for (int i = 0; i < Rules.LISTER_DEPTH_STOPS; i++) {
                g.setForTest(100, 0, 290);
                Game.Result r = g.act("work");
                check(r.ok(), "drill " + i + ": " + r.error());
                check(g.act("work").error().startsWith("Ready in"), "cooldown after drill");
                g.clearCooldownsForTest();
                if (g.dataBuffer() > 50) g.act("send");
                g.clearCooldownsForTest();
            }
            eq(g.drillDepthM(), 1.0, "depth");
            check(g.act("work").error().contains("1.0 m"), "blocked at 1 m");
        });

        test("send moves data home and costs power", () -> {
            Game g = new Game(EDS, CRISIUM);
            check(g.act("send").error() != null, "nothing to send");
            g.act("work");
            double buf = g.dataBuffer();
            double p = g.power();
            check(g.act("send").ok(), "send");
            eq(g.dataSent(), buf, "sent");
            eq(g.dataBuffer(), 0, "buffer empty");
            eq(g.power(), p - Rules.SEND.powerCost(), "power cost");
        });

        test("LRA pings go straight home, fade with dust, and follow LRO passes", () -> {
            Game g = new Game(LRA, CRISIUM);
            g.setForTest(0, 0, 0);
            g.act("work");
            eq(g.dataSent(), Rules.PING_DATA, "clean ping");
            check(g.act("work").error() != null, "wait for next LRO pass");
            g.tick(Rules.LRO_PASS_HOURS);
            g.setForTest(0, 50, 0);
            g.act("work");
            eq(g.dataSent(), Rules.PING_DATA * 1.5, "dusty ping is half");
            check(!g.actionIds().contains("heater"), "passive pet has no heater");
        });

        test("dust and a tipped landing cut solar power", () -> {
            Game clean = new Game(EDS, CRISIUM);
            clean.tick(100);
            double cleanSolar = clean.solarPerHour();
            Game dirty = new Game(EDS, CRISIUM);
            dirty.tick(100);
            dirty.setForTest(dirty.power(), 80, dirty.petTempK());
            check(dirty.solarPerHour() < cleanSolar * 0.5, "dust blocks the panel");
            Game tipped = new Game(EDS, CRISIUM, "Tippy", true);
            tipped.tick(100);
            check(tipped.solarPerHour() < cleanSolar * 0.5, "tipped lander charges less");
        });

        test("heater warms, sunshade cools", () -> {
            Game g = new Game(LISTER, CRISIUM);
            g.setHourForTest(Rules.DAY_HOURS + 20);
            double cold = g.targetTempK();
            g.act("heater");
            eq(g.targetTempK(), cold + Rules.HEATER_BOOST_K, "heater boost");
            Game d = new Game(LISTER, CRISIUM);
            d.setHourForTest(Rules.DAY_HOURS / 2);
            double hot = d.targetTempK();
            d.act("shade");
            eq(d.targetTempK(), hot - Rules.SHADE_DROP_K, "shade drop");
        });

        test("heater switches off when the battery is empty", () -> {
            Game g = new Game(LISTER, CRISIUM);
            g.setHourForTest(Rules.DAY_HOURS + 1);
            g.setForTest(30, 0, 290);
            g.act("heater");
            List<Event> ev = g.tick(20);
            check(!g.heaterOn(), "heater off");
            check(has(ev, "heaterOff"), "heaterOff event");
            check(has(ev, "powerCritical"), "powerCritical event");
        });

        test("a careful player keeps LISTER alive past Blue Ghost's record", () -> {
            Game g = playWithBot(LISTER, CRISIUM);
            check(g.milestones().contains("blue-ghost-1"), "beat Blue Ghost 1; died at h" + (int) g.hour());
            eq(g.drillDepthM(), 1.0, "drilled to 1 m");
            check(g.dataSent() > 0, "sent data");
        });

        test("every fact, site and milestone cites a real source", () -> {
            for (Sources.Fact f : Sources.FACTS) check(Sources.BY_ID.containsKey(f.sourceId()), "fact " + f.text());
            for (Site s : Sites.ALL) for (String id : s.sourceIds()) check(Sources.BY_ID.containsKey(id), s.id() + " " + id);
            for (Rules.Milestone m : Rules.MILESTONES) check(Sources.BY_ID.containsKey(m.sourceId()), m.id());
            for (Pet p : Pet.ALL) check(p.sourceId() == null || Sources.BY_ID.containsKey(p.sourceId()), p.id());
        });

        test("state JSON contains what the website needs", () -> {
            String json = new Game(LISTER, CRISIUM, "Pip \"the\" drill", false).toJson();
            for (String key : List.of("\"petName\"", "\"power\"", "\"petTempK\"", "\"mood\"", "\"actions\"", "\"dayProgress\""))
                check(json.contains(key), "json has " + key);
            check(json.contains("Pip \\\"the\\\" drill"), "names are escaped");
        });

        // ---------------------------------------------------------------- Rover Run

        test("every site has real coordinates with a source; rover runs at Apollo 17's pace", () -> {
            for (Site s : Sites.ALL) {
                check(s.lat() >= -90 && s.lat() <= 90 && s.lon() >= -180 && s.lon() <= 180, s.id() + " coords");
                check(Sources.BY_ID.containsKey(s.coordSourceId()), s.id() + " coord source " + s.coordSourceId());
            }
            eq(Rules.ROVER_KMH, 35.9 / (4 + 26 / 60.0), "35.9 km in 4 h 26 min");
            check(Math.abs(Rules.ROVER_KMH - 8.1) < 0.01, "about 8.1 km/h");
        });

        test("great-circle distances are symmetric and sensible", () -> {
            double d = MALAPERT.distanceKm(MOUTON);
            eq(d, MOUTON.distanceKm(MALAPERT), "symmetric");
            check(d > 100 && d < 250, "Malapert A to Mons Mouton is a polar hop: " + d);
            double far = CRISIUM.distanceKm(MALAPERT);
            check(far > 2500 && far < 3800, "Crisium to Malapert A is thousands of km: " + far);
            eq(MALAPERT.distanceKm(MALAPERT), 0, "zero to itself");
        });

        test("drive: the rover stops at the destination, switches site and logs the trip", () -> {
            Game g = new Game(LRA, MALAPERT);
            Game.Result r = g.drive("MONS_MOUTON");
            check(r.ok() && has(r.events(), "departed"), "departs: " + r.error());
            double km = MALAPERT.distanceKm(MOUTON);
            double hours = km / Rules.ROVER_KMH;
            List<Event> ev = g.tick(hours + 100);
            check(has(ev, "arrived"), "arrived event");
            eq(g.hour(), hours, "time stops at arrival");
            check(g.site().id().equals("MONS_MOUTON"), "now at Mons Mouton");
            check(g.trip() == null, "trip over");
            eq(g.kmDriven(), km, "odometer");
            eq(g.legs(), 1, "one leg");
        });

        test("drive refuses bad trips; no science while moving", () -> {
            Game g = new Game(LISTER, MALAPERT);
            check(g.drive("MALAPERT_A").error().startsWith("Already at"), "same site");
            check(g.drive("NOWHERE").error().startsWith("Unknown site"), "unknown site");
            check(g.drive("MONS_MOUTON").ok(), "go");
            check(g.drive("MARE_CRISIUM").error().startsWith("Already driving"), "one trip at a time");
            check(g.act("work").error().contains("parked"), "no drilling while driving");
            check(g.act("clean").ok(), "can still shake off dust");
            Game dead = new Game(LISTER, SHADOW);
            dead.tick(200);
            check(dead.drive("MALAPERT_A").error() != null, "fainted pets don't drive");
        });

        test("driving kicks up dust and blends conditions toward the destination", () -> {
            Game parked = new Game(LRA, MALAPERT);
            parked.tick(10);
            Game driving = new Game(LRA, MALAPERT);
            driving.drive("SHADOWED_CRATER");
            driving.tick(10);
            eq(driving.dust() - parked.dust(), Rules.DRIVE_DUST_PER_HOUR * 10, "extra drive dust");
            Game.Trip t = driving.trip();
            check(t != null && t.progress() > 0 && t.progress() < 1, "mid-trip");
            check(driving.sunlightHere() < MALAPERT.sunlight() && driving.sunlightHere() > 0,
                    "sunlight fades toward the shadowed crater: " + driving.sunlightHere());
        });

        test("a pet that faints on the road stops the rover where it is", () -> {
            Game g = new Game(LISTER, CRISIUM);
            check(g.drive("MALAPERT_A").ok(), "long haul");
            List<Event> ev = g.tick(Rules.GAME_HOURS);
            check(!g.alive(), "neglected LISTER faints on a drive of hundreds of hours");
            check(!has(ev, "arrived"), "never arrives");
            check(g.trip() != null && g.trip().progress() < 1, "rover stopped mid-trip");
        });

        test("state JSON has the trip, odometer, cooldowns and coordinates", () -> {
            Game g = new Game(EDS, MALAPERT);
            check(g.act("work").ok(), "dust test");
            g.drive("MONS_MOUTON");
            g.tick(1);
            String json = g.toJson();
            for (String key : List.of("\"trip\":{", "\"kmDriven\"", "\"legs\"", "\"cooldowns\":{\"work\"",
                    "\"sunlightHere\"", "\"lat\":-80.1300"))
                check(json.contains(key), "json has " + key);
        });

        balanceReport();

        System.out.println();
        System.out.println(passed + " passed, " + failures.size() + " failed");
        failures.forEach(f -> System.out.println("  FAIL " + f));
        if (!failures.isEmpty()) System.exit(1);
    }

    // ------------------------------------------------------------------ bot player

    /** A simple careful player, used by tests and the balance report. */
    static Game playWithBot(Pet pet, Site site) {
        Game g = new Game(pet, site);
        while (g.alive() && !g.won()) {
            double t = g.petTempK();
            if (!pet.passive()) {
                boolean hot = t > pet.maxSafeK() - 25;
                boolean cold = t < pet.minSafeK() + 25;
                if (hot && !g.shadeOn() && g.isDay()) g.act("shade");
                if (hot && g.heaterOn()) g.act("heater");
                if (cold && g.shadeOn()) g.act("shade");
                if (cold && !g.heaterOn()) g.act("heater");
                if (!hot && !cold && g.heaterOn() && t > pet.minSafeK() + 70) g.act("heater");
                if (g.dataBuffer() >= 24 && g.power() > 40) g.act("send");
            }
            if (g.dust() > 40 && (pet.passive() || g.power() > 50)) g.act("clean");
            if (pet.passive() || g.power() > 60) g.act("work");
            g.tick(1);
        }
        return g;
    }

    static void balanceReport() {
        System.out.println();
        System.out.println("Balance report (one full lunar day + night = " + (int) Rules.GAME_HOURS + " h)");
        System.out.printf("%-16s %-7s %-26s %-26s%n", "site", "pet", "left alone", "careful player");
        for (Site site : Sites.ALL) {
            for (Pet pet : Pet.ALL) {
                Game idle = new Game(pet, site);
                idle.tick(Rules.GAME_HOURS + 1);
                Game bot = playWithBot(pet, site);
                System.out.printf("%-16s %-7s %-26s %-26s%n", site.id(), pet.id(), outcome(idle),
                        outcome(bot) + String.format(" data %.0f", bot.dataSent()));
            }
        }
    }

    static String outcome(Game g) {
        if (g.won()) return "survived day+night";
        String phase = g.hour() < Rules.DAY_HOURS ? "day" : "night";
        return String.format("fainted h%.0f (%s)", g.hour(), phase);
    }

    // ------------------------------------------------------------------ tiny test helpers

    static void test(String name, Runnable body) {
        int before = failures.size();
        try {
            body.run();
        } catch (Throwable t) {
            failures.add(name + ": " + t);
        }
        if (failures.size() == before) {
            passed++;
            System.out.println("  ok   " + name);
        } else {
            System.out.println("  FAIL " + name);
        }
    }

    static void check(boolean cond, String what) {
        if (!cond) throw new AssertionError(what);
    }

    static void eq(double actual, double expected, String what) {
        if (Math.abs(actual - expected) > 1e-6) throw new AssertionError(what + ": expected " + expected + " got " + actual);
    }

    static boolean has(List<Event> events, String type) {
        return events.stream().anyMatch(e -> e.type().equals(type));
    }

    static long count(List<Event> events, String type) {
        return events.stream().filter(e -> e.type().equals(type)).count();
    }
}
