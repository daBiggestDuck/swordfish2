package engine;

import java.util.List;
import java.util.Optional;

/**
 * Landing sites with real temperatures.
 * The data branch can replace this list; keep the ids in sync with story and map.
 *
 * Temperatures: Diviner (equator ~400 K noon, below 100 K night; sunlit polar rims ~220 K;
 * shadowed craters down to 25 K) and the LRO polar maps (night minimums 20–100 K).
 * Sunlight factors are game values based on LROC: the polar sun sits near the horizon.
 */
public final class Sites {

    public static final List<Site> ALL = List.of(
            new Site("MARE_CRISIUM", "Mare Crisium", "Near side, mid-latitude",
                    400, 95, 1.0,
                    "Blue Ghost Mission 1 landed here and ran 346 hours of daylight.",
                    List.of("diviner", "firefly-bg1", "sciam-bg1")),
            new Site("REINER_GAMMA", "Reiner Gamma", "Near side, near the equator",
                    400, 95, 1.0,
                    "Bright swirls on a dark plain. A planned IM-3 landing site.",
                    List.of("diviner")),
            new Site("MALAPERT_A", "Malapert A", "South polar region",
                    220, 90, 0.55,
                    "IM-1 (Odysseus) landed near here and worked seven Earth days.",
                    List.of("diviner", "lro-temps", "lroc-sunlight", "sciam-bg1")),
            new Site("MONS_MOUTON", "Mons Mouton", "South polar region",
                    220, 90, 0.55,
                    "IM-2 (Athena) landed near the south pole and tipped onto its side.",
                    List.of("diviner", "lro-temps", "lroc-sunlight", "sciam-bg1")),
            new Site("SHADOWED_CRATER", "Permanently Shadowed Crater", "South polar crater floor",
                    40, 25, 0.0,
                    "Never sees the Sun. Only the passive retroreflector can live here.",
                    List.of("diviner", "lro-temps", "lroc-sunlight")));

    public static Optional<Site> byId(String id) {
        return ALL.stream().filter(s -> s.id().equalsIgnoreCase(id)).findFirst();
    }

    private Sites() {}
}
