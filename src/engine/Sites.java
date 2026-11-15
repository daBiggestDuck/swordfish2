package engine;

import java.util.List;
import java.util.Optional;

/**
 * Landing sites with real temperatures and real coordinates.
 * The data branch can replace this list; keep the ids in sync with story and map.
 *
 * Temperatures: Diviner (equator ~400 K noon, below 100 K night; sunlit polar rims ~220 K;
 * shadowed craters down to 25 K) and the LRO polar maps (night minimums 20–100 K).
 * Sunlight factors are game values based on LROC: the polar sun sits near the horizon.
 * Coordinates: landing fixes where a lander is on the surface (Blue Ghost 1, IM-1, IM-2),
 * the Moon Trek CLPS layer for the planned Reiner Gamma site, and the IAU/USGS gazetteer
 * centre of Shackleton for the permanently shadowed crater.
 */
public final class Sites {

    public static final List<Site> ALL = List.of(
            new Site("MARE_CRISIUM", "Mare Crisium", "Near side, mid-latitude",
                    18.5623, 61.8103,
                    400, 95, 1.0,
                    "Blue Ghost Mission 1 landed here and ran 346 hours of daylight.",
                    "leag-bg1",
                    List.of("diviner", "firefly-bg1", "sciam-bg1")),
            new Site("REINER_GAMMA", "Reiner Gamma", "Near side, near the equator",
                    7.39, -58.96,
                    400, 95, 1.0,
                    "Bright swirls on a dark plain. A planned IM-3 landing site.",
                    "moontrek-clps",
                    List.of("diviner")),
            new Site("MALAPERT_A", "Malapert A", "South polar region",
                    -80.13, 1.44,
                    220, 90, 0.55,
                    "IM-1 (Odysseus) landed near here and worked seven Earth days.",
                    "nasa-lro-im1",
                    List.of("diviner", "lro-temps", "lroc-sunlight", "sciam-bg1")),
            new Site("MONS_MOUTON", "Mons Mouton", "South polar region",
                    -84.7906, 29.1957,
                    220, 90, 0.55,
                    "IM-2 (Athena) landed near the south pole and tipped onto its side.",
                    "lroc-im2",
                    List.of("diviner", "lro-temps", "lroc-sunlight", "sciam-bg1", "lroc-im2")),
            new Site("SHADOWED_CRATER", "Shackleton Crater floor", "South pole, permanently shadowed",
                    -89.67, 129.78,
                    40, 25, 0.0,
                    "Shackleton's floor never sees the Sun. Only the passive retroreflector can live here.",
                    "usgs-shackleton",
                    List.of("diviner", "lro-temps", "lroc-sunlight", "nasa-shackleton")));

    public static Optional<Site> byId(String id) {
        return ALL.stream().filter(s -> s.id().equalsIgnoreCase(id)).findFirst();
    }

    private Sites() {}
}
