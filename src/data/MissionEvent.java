package data;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/**
 * Real mission events that fire as pop-ups during the pet game loop.
 * Each event is tied to a specific mission, with a NASA source link.
 *
 * The story branch consumes these for narrative framing;
 * the engine branch uses them as game triggers.
 */
public class MissionEvent {
    public final String id;
    public final String missionId;     // FK → Mission.id
    public final String title;
    public final String description;
    public final String lunarPhase;    // "day", "night", "sunset", "sunrise", "any"
    public final String sourceUrl;
    public final boolean positive;     // true = good news, false = setback

    public MissionEvent(String id, String missionId, String title,
                        String description, String lunarPhase,
                        String sourceUrl, boolean positive) {
        this.id = id;
        this.missionId = missionId;
        this.title = title;
        this.description = description;
        this.lunarPhase = lunarPhase;
        this.sourceUrl = sourceUrl;
        this.positive = positive;
    }

    public String toJson() {
        return "{"
            + "\"id\":" + JsonUtil.quote(id) + ","
            + "\"missionId\":" + JsonUtil.quote(missionId) + ","
            + "\"title\":" + JsonUtil.quote(title) + ","
            + "\"description\":" + JsonUtil.quote(description) + ","
            + "\"lunarPhase\":" + JsonUtil.quote(lunarPhase) + ","
            + "\"sourceUrl\":" + JsonUtil.quote(sourceUrl) + ","
            + "\"positive\":" + positive
            + "}";
    }

    public static List<MissionEvent> all() {
        return Collections.unmodifiableList(Arrays.asList(

            new MissionEvent("im1-tilt", "to2-im",
                "Odysseus Lands — Tilted!",
                "IM-1 touched down at Malapert A but came to rest on its side. "
                + "A landing leg caught on the surface. Most instruments still "
                + "collected data despite the tilt.",
                "day",
                "https://blogs.nasa.gov/clps/2024/02/",
                true),

            new MissionEvent("im1-sunset", "to2-im",
                "First Lunar Sunset for IM-1",
                "As the Sun set over Malapert A, Odysseus powered down. "
                + "The tilted lander's solar panels lost their last light.",
                "sunset",
                "https://blogs.nasa.gov/clps/2024/02/",
                false),

            new MissionEvent("im1-lra-works", "to2-im",
                "Retroreflector Still Works!",
                "Even on its side, the Laser Retroreflector Array is passive — "
                + "no power needed. It will bounce laser light back for decades.",
                "night",
                "https://science.nasa.gov/lunar-science/clps-deliveries/to2-im/",
                true),

            new MissionEvent("peregrine-leak", "to2-ab",
                "Peregrine: Propellant Leak",
                "Hours after launch, Astrobotic's Peregrine developed a propellant "
                + "leak. The lander could not attempt a lunar landing. All 5 NASA "
                + "payloads gathered what data they could during transit.",
                "any",
                "https://science.nasa.gov/lunar-science/clps-deliveries/to2-astrobotic/",
                false),

            new MissionEvent("bg1-success", "to19d",
                "Blue Ghost 1 Lands Successfully!",
                "Firefly's Blue Ghost 1 became the first fully successful CLPS "
                + "mission, delivering 10 NASA payloads to Mare Crisium.",
                "day",
                "https://blogs.nasa.gov/clps/2025/02/21/blue-ghost-prepares-for-landing-nasa-instrument-breaks-record/",
                true),

            new MissionEvent("bg1-sunset-photo", "to19d",
                "Blue Ghost Photographs Lunar Sunset",
                "SCALPSS 1.1 cameras captured a stunning sequence of the Sun "
                + "setting behind the rim of Mare Crisium — real footage from "
                + "the lunar surface.",
                "sunset",
                "https://blogs.nasa.gov/clps/2025/01/30/",
                true),

            new MissionEvent("bg1-lister-drill", "to19d",
                "LISTER Drills Into the Moon",
                "The heat-flow probe began drilling into the regolith at Mare "
                + "Crisium to measure how heat escapes from the Moon's interior.",
                "day",
                "https://science.nasa.gov/lunar-science/clps-deliveries/to19d-firefly/",
                true),

            new MissionEvent("im2-launch", "to-prime1",
                "Athena Launches for the South Pole",
                "IM-2 lifted off carrying MSolo and a Micro-Nova hopper to "
                + "the Shackleton Connecting Ridge — one of the most extreme "
                + "landing sites ever attempted.",
                "any",
                "https://blogs.nasa.gov/clps/2025/02/26/liftoff-intuitive-machines-lunar-lander-begins-journey-to-the-moon/",
                true),

            new MissionEvent("im2-landing", "to-prime1",
                "Athena Lands Near Shackleton",
                "IM-2 touched down at the lunar south pole. MSolo will search "
                + "for volatile compounds — water and CO₂ — in one of the "
                + "coldest places in the solar system.",
                "day",
                "https://blogs.nasa.gov/clps/2025/02/",
                true),

            new MissionEvent("night-survival", "to-prime1",
                "14 Days of Darkness",
                "The lunar night lasts about 14 Earth days. Without sunlight, "
                + "temperatures plummet below -170°C. Only passive instruments "
                + "like the retroreflector survive without power.",
                "night",
                "https://www.nasa.gov/commercial-lunar-payload-services/",
                false),

            new MissionEvent("earth-below-horizon", "cs-3",
                "No Signal From the Far Side",
                "On the lunar far side, Earth never rises above the horizon. "
                + "Blue Ghost 2 will carry a relay satellite so instruments "
                + "can phone home.",
                "any",
                "https://science.nasa.gov/lunar-science/clps-deliveries/cs-3/",
                false),

            new MissionEvent("dust-sticks", "to19d",
                "Lunar Dust Gets Everywhere",
                "RAC confirmed that lunar dust clings to surfaces through "
                + "electrostatic charge. It coats solar panels, clogs "
                + "mechanisms, and degrades optics over time.",
                "day",
                "https://science.nasa.gov/lunar-science/clps-deliveries/to19d-firefly/",
                false)
        ));
    }
}
