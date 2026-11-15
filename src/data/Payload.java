package data;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/**
 * A NASA-provided payload / instrument on a CLPS mission.
 * Each payload maps to a "pet archetype" via its type field.
 *
 * Sources:
 *   science.nasa.gov/lunar-science/clps-deliveries/<task-order>/
 *   pds-geosciences.wustl.edu/missions/clps/index.htm
 */
public class Payload {
    public final String id;
    public final String name;
    public final String acronym;
    public final String type;           // camera, drill, retroreflector, spectrometer, nav, sampler, radio, computer, gauge
    public final String keyMeasurement;
    public final String pi;
    public final String leadOrg;
    public final boolean passive;       // true = needs no power (LRA)
    public final double powerW;         // watts, NaN if unpublished
    public final double massKg;         // kg, NaN if unpublished
    public final String petArchetype;   // maps to pet identity: lister, lra, rac, msolo, scalpss, planetvac, trident, ln-1
    public final String missionId;      // FK → Mission.id
    public final String sourceUrl;

    public Payload(String id, String name, String acronym, String type,
                   String keyMeasurement, String pi, String leadOrg,
                   boolean passive, double powerW, double massKg,
                   String petArchetype, String missionId, String sourceUrl) {
        this.id = id;
        this.name = name;
        this.acronym = acronym;
        this.type = type;
        this.keyMeasurement = keyMeasurement;
        this.pi = pi;
        this.leadOrg = leadOrg;
        this.passive = passive;
        this.powerW = powerW;
        this.massKg = massKg;
        this.petArchetype = petArchetype;
        this.missionId = missionId;
        this.sourceUrl = sourceUrl;
    }

    public String toJson() {
        StringBuilder sb = new StringBuilder("{");
        sb.append("\"id\":").append(JsonUtil.quote(id)).append(",");
        sb.append("\"name\":").append(JsonUtil.quote(name)).append(",");
        sb.append("\"acronym\":").append(JsonUtil.quote(acronym)).append(",");
        sb.append("\"type\":").append(JsonUtil.quote(type)).append(",");
        sb.append("\"keyMeasurement\":").append(JsonUtil.quote(keyMeasurement)).append(",");
        sb.append("\"pi\":").append(JsonUtil.quote(pi)).append(",");
        sb.append("\"leadOrg\":").append(JsonUtil.quote(leadOrg)).append(",");
        sb.append("\"passive\":").append(passive).append(",");
        if (!Double.isNaN(powerW))
            sb.append("\"powerW\":").append(JsonUtil.fmt(powerW, 1)).append(",");
        if (!Double.isNaN(massKg))
            sb.append("\"massKg\":").append(JsonUtil.fmt(massKg, 1)).append(",");
        sb.append("\"petArchetype\":").append(JsonUtil.quote(petArchetype)).append(",");
        sb.append("\"missionId\":").append(JsonUtil.quote(missionId)).append(",");
        sb.append("\"sourceUrl\":").append(JsonUtil.quote(sourceUrl));
        sb.append("}");
        return sb.toString();
    }

    // ── Registry ──────────────────────────────────────────────

    private static final String SRC_TO2IM  = "https://science.nasa.gov/lunar-science/clps-deliveries/to2-im/";
    private static final String SRC_TO19D  = "https://science.nasa.gov/lunar-science/clps-deliveries/to19d-firefly/";
    private static final String SRC_PRIME1 = "https://science.nasa.gov/lunar-science/clps-deliveries/prime-1-im/";
    private static final String SRC_TO2AB  = "https://science.nasa.gov/lunar-science/clps-deliveries/to2-astrobotic/";
    private static final String SRC_CP11   = "https://science.nasa.gov/lunar-science/clps-deliveries/cp-11/";
    private static final String SRC_CS3    = "https://science.nasa.gov/lunar-science/clps-deliveries/cs-3/";
    private static final String SRC_TO20A  = "https://science.nasa.gov/lunar-science/clps-deliveries/to20a-astrobotic/";

    private static Payload p(String id, String name, String acronym, String type,
                              String keyMeasurement, String pi, String leadOrg,
                              boolean passive, double powerW, double massKg,
                              String petArchetype, String missionId, String sourceUrl) {
        return new Payload(id, name, acronym, type, keyMeasurement, pi, leadOrg,
                           passive, powerW, massKg, petArchetype, missionId, sourceUrl);
    }

    private static final double U = Double.NaN; // unpublished

    public static List<Payload> all() {
        return Collections.unmodifiableList(Arrays.asList(

            // ════ TO2-AB (Peregrine) ════
            p("nss", "Neutron Spectrometer System", "NSS", "spectrometer",
              "Hydrogen abundance in regolith",
              null, "NASA ARC", false, U, U, "msolo", "peregrine-1", SRC_TO2AB),

            p("lets", "Linear Energy Transfer Spectrometer", "LETS", "spectrometer",
              "Radiation dose on lunar surface",
              null, "NASA JSC", false, U, U, "msolo", "peregrine-1", SRC_TO2AB),

            p("nirvss", "Near-Infrared Volatile Spectrometer System", "NIRVSS", "spectrometer",
              "Surface volatiles and minerals",
              null, "NASA ARC", false, U, U, "msolo", "peregrine-1", SRC_TO2AB),

            p("pitms", "Peregrine Ion-Trap Mass Spectrometer", "PITMS", "spectrometer",
              "Exospheric volatiles at the surface",
              null, "NASA GSFC", false, U, U, "msolo", "peregrine-1", SRC_TO2AB),

            p("lra-peregrine", "Laser Retroreflector Array", "LRA", "retroreflector",
              "Precise distances from orbit",
              "Dr. Xiaoli Sun", "NASA GSFC", true, 0, 0.5, "lra", "peregrine-1", SRC_TO2AB),

            // ════ TO2-IM (IM-1 Odysseus) ════
            p("ln-1", "Lunar Node 1 Navigation Demonstrator", "LN-1", "nav",
              "Distance via pseudonoise ranging codes",
              "Dr. Evan Anzalone", "NASA MSFC", false, U, U, "ln-1", "im-1", SRC_TO2IM),

            p("scalpss-im1", "Stereo Cameras for Lunar Plume-Surface Studies", "SCALPSS", "camera",
              "Video/still images of plume crater formation",
              "Michelle Munk", "NASA LaRC", false, U, U, "scalpss", "im-1", SRC_TO2IM),

            p("rolses", "Radio-wave Observations at the Lunar Surface of the photoElectron Sheath",
              "ROLSES", "radio",
              "Electron sheath density and radio emissions",
              "Dr. Nat Gopalswamy", "NASA GSFC", false, U, U, "msolo", "im-1", SRC_TO2IM),

            p("ndl", "Navigation Doppler Lidar", "NDL", "nav",
              "Velocity and altitude from 5 km",
              "Dr. Farzin Amzajerdian", "NASA LaRC", false, U, U, "scalpss", "im-1", SRC_TO2IM),

            p("rfmg", "Radio Frequency Mass Gauge", "RFMG", "gauge",
              "Mass of cryogenic fuel in tanks",
              "Dr. Greg Zimmerli", "NASA GRC", false, U, U, "msolo", "im-1", SRC_TO2IM),

            p("lra-im1", "Laser Retroreflector Array", "LRA", "retroreflector",
              "Precise distances from orbit",
              "Dr. Xiaoli Sun", "NASA GSFC", true, 0, 0.5, "lra", "im-1", SRC_TO2IM),

            // ════ TO19D (Blue Ghost 1) ════
            p("scalpss-bg1", "Stereo Cameras for Lunar Plume-Surface Studies 1.1", "SCALPSS 1.1", "camera",
              "3D images of plume-surface interaction",
              "Michelle Munk", "NASA LaRC", false, U, U, "scalpss", "blue-ghost-1", SRC_TO19D),

            p("rac", "Regolith Adherence Characterization", "RAC", "sampler",
              "Dust adhesion to materials",
              null, "NASA GRC", false, U, U, "rac", "blue-ghost-1", SRC_TO19D),

            p("lms", "Lunar Magnetotelluric Sounder", "LMS", "spectrometer",
              "Interior electrical conductivity",
              null, "NASA GSFC", false, U, U, "msolo", "blue-ghost-1", SRC_TO19D),

            p("radpc", "Radiation Tolerant Computer", "RadPC", "computer",
              "Radiation-hardened compute performance",
              null, "NASA GSFC", false, U, U, "msolo", "blue-ghost-1", SRC_TO19D),

            p("lpv", "Lunar PlanetVac", "LPV", "sampler",
              "Pneumatic regolith sample capture",
              null, "Honeybee Robotics", false, U, U, "planetvac", "blue-ghost-1", SRC_TO19D),

            p("lister", "Lunar Instrumentation for Subsurface Thermal Exploration with Rapidity",
              "LISTER", "drill",
              "Heat flow from the lunar interior",
              null, "Honeybee Robotics", false, U, U, "lister", "blue-ghost-1", SRC_TO19D),

            p("lexi", "Lunar Environment heliospheric X-ray Imager", "LEXI", "camera",
              "Solar wind-magnetosphere interaction",
              null, "NASA GSFC", false, U, U, "scalpss", "blue-ghost-1", SRC_TO19D),

            p("nglr", "Next Generation Laser Retroreflector", "NGLR", "retroreflector",
              "Precise Earth-Moon laser ranging",
              null, "University of Maryland", true, 0, U, "lra", "blue-ghost-1", SRC_TO19D),

            p("lra-bg1", "Laser Retroreflector Array", "LRA", "retroreflector",
              "Precise distances from orbit",
              "Dr. Xiaoli Sun", "NASA GSFC", true, 0, 0.5, "lra", "blue-ghost-1", SRC_TO19D),

            p("stereo-bg1", "Stereo Camera", "StereoCAM", "camera",
              "Surface context imagery",
              null, "NASA GSFC", false, U, U, "scalpss", "blue-ghost-1", SRC_TO19D),

            // ════ TO-PRIME1 (IM-2 Athena) — includes Triddy (`trident`) ════
            // Game catalog home is Mons Mouton; do not reuse id `trident` on Griffin.
            p("trident", "The Regolith and Ice Drill for Exploring New Terrain", "TRIDENT", "drill",
              "Subsurface ice sampling",
              null, "Honeybee Robotics", false, U, U, "trident", "im-2", SRC_PRIME1),

            p("msolo", "Mass Spectrometer Observing Lunar Operations", "MSolo", "spectrometer",
              "Volatile species at the surface (water, CO2)",
              null, "NASA KSC", false, U, U, "msolo", "im-2", SRC_PRIME1),

            p("lra-im2", "Laser Retroreflector Array", "LRA", "retroreflector",
              "Precise distances from orbit",
              "Dr. Xiaoli Sun", "NASA GSFC", true, 0, 0.5, "lra", "im-2", SRC_PRIME1),

            p("micro-nova", "Micro-Nova hopper", "Micro-Nova", "nav",
              "Terrain mobility demonstration",
              null, "Intuitive Machines", false, U, U, "scalpss", "im-2", SRC_PRIME1),

            // ════ CP-11 (IM-3) ════
            // Payloads verified against science.nasa.gov/lunar-science/clps-deliveries/cp-11/
            // (the earlier lusee-night/lra-im3/scalpss-im3/mag-im3 entries were wrong:
            //  LuSEE-Night flies on Blue Ghost 2 / CS-3, and IM-3 carries these four).
            p("lvx", "Lunar Vertex", "LVx", "spectrometer",
              "Origin of lunar magnetic fields and their relation to surface swirls",
              "Dr. David Blewett", "Johns Hopkins APL", false, U, U, "msolo", "im-3", SRC_CP11),

            p("cadre", "Cooperative Autonomous Distributed Robotic Exploration", "CADRE", "nav",
              "Autonomous multi-rover exploration and distributed measurements",
              "Jean-Pierre de la Croix", "NASA JPL", false, U, U, "planetvac", "im-3", SRC_CP11),

            p("mpac", "MoonLIGHT Pointing Actuator", "MPAc", "retroreflector",
              "Earth-Moon laser ranging; test of general relativity",
              "Marco Muccino", "ESA / INFN", true, 0, U, "lra", "im-3", SRC_CP11),

            p("lusem", "Lunar Space Environment Monitor", "LUSEM", "radio",
              "High-energy particles and the near-surface space environment",
              "Young-Jun Choi", "KASI", false, U, U, "msolo", "im-3", SRC_CP11),

            // ════ CS-3 (Blue Ghost 2) ════
            p("lusee-night", "Lunar Surface Electromagnetics Experiment-Night", "LuSEE-Night", "radio",
              "Low-frequency radio astronomy from the lunar farside, surviving the lunar night on battery",
              "Dr. Stuart Bale", "Brookhaven / Lawrence Berkeley (DOE)", false, U, U, "msolo", "blue-ghost-2", SRC_CS3),

            // ════ TO20A (Griffin 1) — placeholder payloads ════
            p("msolo-griffin", "MSolo (Griffin)", "MSolo", "spectrometer",
              "Volatile species near south pole",
              null, "NASA KSC", false, U, U, "msolo", "griffin-1", SRC_TO20A),

            p("lra-griffin", "Laser Retroreflector Array", "LRA", "retroreflector",
              "Precise distances from orbit",
              "Dr. Xiaoli Sun", "NASA GSFC", true, 0, 0.5, "lra", "griffin-1", SRC_TO20A),

            p("nss-griffin", "Neutron Spectrometer System (Griffin)", "NSS", "spectrometer",
              "Hydrogen abundance near south pole",
              null, "NASA ARC", false, U, U, "msolo", "griffin-1", SRC_TO20A)
        ));
    }
}
