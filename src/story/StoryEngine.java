package story;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Decides which mission pop-ups should appear as the lunar day plays out.
 *
 * Hook for the engine branch (Aku): call {@link #advance(double)} every game tick with the
 * lunar-day progress (0.0 sunrise .. 1.0 end of day) and show whatever moments come back.
 */
public class StoryEngine {

    private final String siteId;
    private final List<MissionMoment> pool;
    private final Set<String> seen = new HashSet<>();
    private final List<MissionMoment> history = new ArrayList<>();

    /** Site stories plus general stories only (no pet-specific ones). */
    public StoryEngine(String siteId) {
        this(siteId, "");
    }

    public StoryEngine(String siteId, String petId) {
        this(siteId, petId, MissionMoments.ALL);
    }

    public StoryEngine(String siteId, String petId, List<MissionMoment> moments) {
        this.siteId = siteId;
        this.pool = moments.stream().filter(m -> m.appliesTo(siteId, petId)).toList();
    }

    /** Returns the moments that just became due (each moment fires only once). */
    public List<MissionMoment> advance(double dayProgress) {
        List<MissionMoment> due = new ArrayList<>();
        for (MissionMoment m : pool) {
            if (dayProgress >= m.dayStart() && seen.add(m.id())) {
                due.add(m);
                history.add(m);
            }
        }
        return due;
    }

    /** Every moment shown so far, in order. The Pet Passport lists these as "stories". */
    public List<MissionMoment> history() {
        return List.copyOf(history);
    }

    public String siteId() {
        return siteId;
    }
}
