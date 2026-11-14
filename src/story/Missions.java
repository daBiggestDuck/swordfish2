package story;

import java.util.List;

/**
 * CLPS mission list, in NASA's timeline order (source: "Timeline of Past and Future CLPS Deliveries").
 * Wonil's data branch will eventually own this; keep the ids stable.
 *
 * Landing sites are NOT on the timeline graphic. Blue Ghost 1, IM-1 and Blue Moon Mark 1 sites
 * were checked against NASA pages; the others come from the team's planning notes. Unsure ones
 * are left null.
 */
public final class Missions {

    public static final List<Mission> ALL = List.of(
            new Mission("peregrine-1", "Peregrine Mission One", "Astrobotic Technology",
                    "2024-01-08", null, Mission.NO_LANDING, "SINUS_VISCOSITATIS", "Launched Jan. 8, 2024. No lunar landing."),
            new Mission("im-1", "IM-1 Mission", "Intuitive Machines",
                    "2024-02-15", "2024-02-22", Mission.LANDED, "MALAPERT_A", "Landed tilted on its side."),
            new Mission("blue-ghost-1", "Blue Ghost Mission 1", "Firefly Aerospace",
                    "2025-01-15", "2025-03-02", Mission.LANDED, "MARE_CRISIUM", "Worked through a lunar day."),
            new Mission("im-2", "IM-2 Mission", "Intuitive Machines",
                    "2025-02-27", "2025-03-06", Mission.LANDED, "MONS_MOUTON", null),
            new Mission("blue-moon-1", "Blue Moon Mark 1 Mission", "Blue Origin",
                    null, null, Mission.PLANNED, "SHACKLETON_RIDGE", "Will deliver two NASA payloads (SCALPSS, LRA) to the south pole."),
            new Mission("griffin-1", "Griffin Mission One", "Astrobotic Technology",
                    null, null, Mission.PLANNED, "MONS_MOUTON", null),
            new Mission("im-3", "IM-3 Mission", "Intuitive Machines",
                    null, null, Mission.PLANNED, "REINER_GAMMA", null),
            new Mission("blue-ghost-2", "Blue Ghost Mission 2", "Firefly Aerospace",
                    null, null, Mission.PLANNED, "FAR_SIDE", null),
            new Mission("draper-1", "Draper Mission 1", "Draper",
                    null, null, Mission.PLANNED, null, null),
            new Mission("im-4", "IM-4 Mission", "Intuitive Machines",
                    null, null, Mission.PLANNED, "MONS_MOUTON", null),
            new Mission("blue-ghost-3", "Blue Ghost Mission 3", "Firefly Aerospace",
                    null, null, Mission.PLANNED, "GRUITHUISEN_DOMES", null)
    );

    private Missions() {}
}
