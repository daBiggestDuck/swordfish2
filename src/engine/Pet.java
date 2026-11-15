package engine;

import java.util.List;
import java.util.Optional;

/**
 * Four adoptable payload pets (same set as catalog / story / js-pets).
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
            new Pet("LRA", "Retro", "Laser Retroreflector Array",
                    "IM-1 and IM-2", true, 0, 1000, 0, "Catch a laser ping", "pds-lra"),
            new Pet("EDS", "EDS", "Electrodynamic Dust Shield",
                    "Blue Ghost Mission 1", false, 210, 350, 0.8, "Run a dust test", null),
            new Pet("LN-1", "Nodey", "Lunar Node-1 Navigation Demonstrator",
                    "IM-1 at Malapert A", false, 200, 340, 0.6, "Broadcast a ranging ping", null));

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
