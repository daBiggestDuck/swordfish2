package engine;

import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Every source the engine's real numbers come from, plus the facts taken from each one.
 * Shown on the website (/api/engine/facts) so players can check them.
 *
 * Rule for this file: a fact goes here only if the linked page says it.
 */
public final class Sources {

    public record Source(String id, String title, String url) {
        public String toJson() {
            return Json.obj("id", Json.q(id), "title", Json.q(title), "url", Json.q(url));
        }
    }

    public record Fact(String topic, String text, String sourceId) {
        public String toJson() {
            return Json.obj("topic", Json.q(topic), "text", Json.q(text), "sourceId", Json.q(sourceId));
        }
    }

    public static final List<Source> ALL = List.of(
            new Source("firefly-bg1", "Firefly: Blue Ghost completes 14 days of surface operations",
                    "https://fireflyspace.com/news/firefly-aerospace-successfully-completes-14-days-of-surface-operations-on-the-moon"),
            new Source("diviner", "Diviner Lunar Radiometer: science results (UCLA)",
                    "https://www.diviner.ucla.edu/science"),
            new Source("lro-temps", "NASA LRO fact sheet: polar temperature variation",
                    "https://science.nasa.gov/wp-content/uploads/2024/01/lrolitho7temperaturevariation27may2014.pdf"),
            new Source("lroc-sunlight", "LROC: south pole illumination",
                    "https://lroc.im-ldi.com/visit/exhibits/1/gallery/41"),
            new Source("pds-lister", "NASA PDS: LISTER (Blue Ghost Mission 1)",
                    "https://pds-geosciences.wustl.edu/missions/clps/to19d_lister.htm"),
            new Source("pds-lra", "NASA PDS: Laser Retroreflector Array",
                    "https://pds-geosciences.wustl.edu/missions/clps/lra.htm"),
            new Source("sciam-bg1", "Scientific American: Blue Ghost completes historic lunar mission",
                    "https://www.scientificamerican.com/article/blue-ghost-lander-successfully-completes-historic-lunar-mission/"),
            new Source("pds-clps", "NASA PDS: CLPS data archive",
                    "https://pds-geosciences.wustl.edu/missions/clps/index.htm"),
            new Source("nssdc-lrv", "NASA NSSDC: Apollo Lunar Roving Vehicle",
                    "https://nssdc.gsfc.nasa.gov/planetary/lunar/apollo_lrv.html"),
            new Source("nasa-moon-facts", "NASA NSSDC: Moon fact sheet",
                    "https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html"),
            new Source("leag-bg1", "LEAG 2025: Blue Ghost Mission 1 science highlights",
                    "https://www.hou.usra.edu/meetings/leag2025/presentations/Wednesday/1030_Banks.pdf"),
            new Source("nasa-lro-im1", "NASA: LRO images Intuitive Machines' Odysseus lander",
                    "https://www.nasa.gov/missions/lro/nasas-lro-images-intuitive-machines-odysseus-lander/"),
            new Source("lroc-im2", "LROC: IM-2 Athena seen obliquely",
                    "https://lroc.im-ldi.com/images/1408"),
            new Source("moontrek-clps", "NASA Moon Trek: CLPS sites layer",
                    "https://trek.nasa.gov/moon/trekarcgis3/rest/services/CLPS_sites/MapServer/0/query"),
            new Source("usgs-shackleton", "USGS Gazetteer of Planetary Nomenclature: Shackleton",
                    "https://planetarynames.wr.usgs.gov/Feature/5450"),
            new Source("nasa-shackleton", "NASA: Shackleton crater's illuminated rim and shadowed interior",
                    "https://science.nasa.gov/resource/shackleton-craters-illuminated-rim-shadowed-interior/"));

    public static final List<Fact> FACTS = List.of(
            // Blue Ghost Mission 1
            new Fact("Blue Ghost 1", "Operated more than 14 days on the surface, including 346 hours of daylight.", "firefly-bg1"),
            new Fact("Blue Ghost 1", "Kept working just over 5 hours into the lunar night after sunset on March 16, 2025.", "firefly-bg1"),
            new Fact("Blue Ghost 1", "Sent home more than 119 GB of data, including 51 GB of science and technology data.", "firefly-bg1"),
            new Fact("Blue Ghost 1", "10 NASA instruments operated and collected science data.", "firefly-bg1"),
            new Fact("Blue Ghost 1", "Landed March 2, 2025 in Mare Crisium, a basaltic plain on the Moon's near side.", "sciam-bg1"),
            // Temperatures
            new Fact("Temperature", "Noon at the lunar equator: almost 400 K (about 127 °C).", "diviner"),
            new Fact("Temperature", "Night at the equator: below 100 K (about −173 °C).", "diviner"),
            new Fact("Temperature", "Permanently shadowed polar craters: as low as 25 K (about −248 °C).", "diviner"),
            new Fact("Temperature", "Sunlit crater rims near the poles stay roughly constant at about 220 K (about −53 °C).", "diviner"),
            new Fact("Temperature", "35 cm underground is 40–45 K warmer on average than the surface; at 80 cm the daily swing is imperceptible.", "diviner"),
            new Fact("Temperature", "Polar maps: daily maximum temperatures range from about 40 K to 360 K, minimums from about 20 K to 100 K.", "lro-temps"),
            // Sunlight
            new Fact("Sunlight", "The Moon's axis tilts only 1.54°, so it has no seasons.", "lroc-sunlight"),
            new Fact("Sunlight", "Some peaks near the south pole are sunlit more than 80% of the time, while low areas stay in constant shadow.", "lroc-sunlight"),
            new Fact("Sunlight", "LRO passes over each pole about every two hours.", "lroc-sunlight"),
            // LISTER
            new Fact("LISTER", "Lunar Instrumentation for Subsurface Thermal Exploration with Rapidity, flown on Blue Ghost Mission 1 to Mare Crisium.", "pds-lister"),
            new Fact("LISTER", "The first robotically deployed subsurface thermal probe that actively digs into lunar regolith.", "pds-lister"),
            new Fact("LISTER", "Reached 1 m deep, measuring temperature and thermal conductivity at 8 different depths.", "pds-lister"),
            // LRA
            new Fact("LRA", "8 corner-cube reflectors, each 1.27 cm across, on an aluminum dome 5.0 cm wide and 1.6 cm tall, weighing 20 g.", "pds-lra"),
            new Fact("LRA", "A passive optical instrument that needs no power. It is a target for laser ranging from lunar orbit that pins down the lander's position.", "pds-lra"),
            // Other missions
            new Fact("IM-1", "Odysseus landed in February 2024 and operated seven Earth days before going dark.", "sciam-bg1"),
            new Fact("IM-2", "Athena landed near the south pole on March 6, 2025, tipped onto its side just after touchdown and was declared dead on March 7.", "sciam-bg1"),
            new Fact("CLPS archive", "NASA's PDS holds CLPS data from Peregrine 1 (LETS, NIRVSS, NSS, PITMS), IM-1 (LRA, ROLSES, SCALPSS), IM-2 (LRA, MSOLO) and Blue Ghost 1 (LISTER, LMS, LPV, RAC, RadPC, SCALPSS).", "pds-clps"),
            // Rover Run
            new Fact("Rover", "On Apollo 17 the rover went 35.9 km in 4 hours 26 minutes of total drive time, about 8.1 km/h.", "nssdc-lrv"),
            new Fact("Rover", "Apollo 17's longest rover traverse was 20.1 km, and the rover never got more than 7.6 km from the lunar module.", "nssdc-lrv"),
            new Fact("Rover", "The Moon's volumetric mean radius is 1,737.4 km.", "nasa-moon-facts"),
            new Fact("Sites", "Blue Ghost Mission 1 landed at 18.5623° N, 61.8103° E in Mare Crisium.", "leag-bg1"),
            new Fact("Sites", "NASA's LRO places the IM-1 (Odysseus) landing at 80.13° S, 1.44° E, near Malapert A.", "nasa-lro-im1"),
            new Fact("Sites", "LROC found IM-2 (Athena) at 84.7906° S, 29.1957° E, on its side in a crater about 20 m across.", "lroc-im2"),
            new Fact("Sites", "Shackleton crater is centred at 89.67° S, 129.78° E and is about 21 km across.", "usgs-shackleton"),
            new Fact("Sites", "Peaks on Shackleton's rim get almost continual sunlight, while its interior is perpetually in shadow.", "nasa-shackleton"));

    public static final Map<String, Source> BY_ID =
            ALL.stream().collect(Collectors.toUnmodifiableMap(Source::id, Function.identity()));

    private Sources() {}
}
