package engine;

import java.util.List;
import java.util.Optional;

/**
 * A payload pet: a real CLPS instrument. Ids match the story branch (LRA, LISTER, EDS).
 *
 * Safe temperature ranges and power draw are game values (the sources don't publish them).
 * Real facts are in {@link Sources}.
 *
 * @param passive       needs no power at all (the LRA): never runs out, never freezes
 * @param minSafeK      below this the pet takes cold damage
 * @param maxSafeK      above this the pet takes heat damage
 * @param drawPerHour   power used every game hour just to stay awake
 * @param workLabel     button text for the pet's science action
 */
public record Pet(
        String id,
        String name,
        String fullName,
        String flewOn,
        boolean passive,
        double minSafeK,
        double maxSafeK,
        double drawPerHour,
        String workLabel,
        String sourceId) {

    public static final List<Pet> ALL = List.of(
            new Pet("LISTER", "LISTER", "Lunar Instrumentation for Subsurface Thermal Exploration with Rapidity",
                    "Blue Ghost Mission 1", false, 200, 340, 1.0, "Drill deeper", "pds-lister"),
            new Pet("LRA", "LRA", "Laser Retroreflector Array",
                    "IM-1 and IM-2", true, 0, 1000, 0, "Catch a laser ping", "pds-lra"),
            new Pet("EDS", "EDS", "Electrodynamic Dust Shield",
                    "Blue Ghost Mission 1", false, 210, 350, 0.8, "Run a dust test", null));

    public static Optional<Pet> byId(String id) {
        return ALL.stream().filter(p -> p.id().equalsIgnoreCase(id)).findFirst();
    }

    public String toJson() {
        return Json.obj(
                "id", Json.q(id), "name", Json.q(name), "fullName", Json.q(fullName),
                "flewOn", Json.q(flewOn), "passive", Json.b(passive),
                "minSafeK", Json.n(minSafeK), "maxSafeK", Json.n(maxSafeK),
                "drawPerHour", Json.n(drawPerHour), "workLabel", Json.q(workLabel),
                "sourceId", Json.q(sourceId));
    }
}
