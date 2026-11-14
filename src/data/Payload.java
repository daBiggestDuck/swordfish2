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
    public final String petArchetype;   // maps to pet identity: lister, lra, rac, msolo, scalpss, planetvac
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
    private static final String SRC_CP21   = "https://science.nasa.gov/lunar-science/clps-deliveries/cp-21-science/";
    private static final String SRC_CP22   = "https://science.nasa.gov/lunar-science/clps-deliveries/cp-22-science/";
    private static final String SRC_TO20A  = "https://science.nasa.gov/lunar-science/clps-deliveries/to20a-astrobotic/";
    private static final String SRC_CT3    = "https://science.nasa.gov/lunar-science/clps-deliveries/ct-3-science/";

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
              null, "NASA ARC", false, U, U, "msolo", "to2-ab", SRC_TO2AB),

            p("lets", "Linear Energy Transfer Spectrometer", "LETS", "spectrometer",
              "Radiation dose on lunar surface",
              null, "NASA JSC", false, U, U, "msolo", "to2-ab", SRC_TO2AB),

            p("nirvss", "Near-Infrared Volatile Spectrometer System", "NIRVSS", "spectrometer",
              "Surface volatiles and minerals",
              null, "NASA ARC", false, U, U, "msolo", "to2-ab", SRC_TO2AB),

            p("pitms", "Peregrine Ion-Trap Mass Spectrometer", "PITMS", "spectrometer",
              "Exospheric volatiles at the surface",
              null, "NASA GSFC", false, U, U, "msolo", "to2-ab", SRC_TO2AB),

            p("lra-peregrine", "Laser Retroreflector Array", "LRA", "retroreflector",
              "Precise distances from orbit",
              "Dr. Xiaoli Sun", "NASA GSFC", true, 0, 0.5, "lra", "to2-ab", SRC_TO2AB),

            // ════ TO2-IM (IM-1 Odysseus) ════
            p("ln-1", "Lunar Node 1 Navigation Demonstrator", "LN-1", "nav",
              "Distance via pseudonoise ranging codes",
              "Dr. Evan Anzalone", "NASA MSFC", false, U, U, "scalpss", "to2-im", SRC_TO2IM),

            p("scalpss-im1", "Stereo Cameras for Lunar Plume-Surface Studies", "SCALPSS", "camera",
              "Video/still images of plume crater formation",
              "Michelle Munk", "NASA LaRC", false, U, U, "scalpss", "to2-im", SRC_TO2IM),

            p("rolses", "Radio-wave Observations at the Lunar Surface of the photoElectron Sheath",
              "ROLSES", "radio",
              "Electron sheath density and radio emissions",
              "Dr. Nat Gopalswamy", "NASA GSFC", false, U, U, "msolo", "to2-im", SRC_TO2IM),

            p("ndl", "Navigation Doppler Lidar", "NDL", "nav",
              "Velocity and altitude from 5 km",
              "Dr. Farzin Amzajerdian", "NASA LaRC", false, U, U, "scalpss", "to2-im", SRC_TO2IM),

            p("rfmg", "Radio Frequency Mass Gauge", "RFMG", "gauge",
              "Mass of cryogenic fuel in tanks",
              "Dr. Greg Zimmerli", "NASA GRC", false, U, U, "msolo", "to2-im", SRC_TO2IM),

            p("lra-im1", "Laser Retroreflector Array", "LRA", "retroreflector",
              "Precise distances from orbit",
              "Dr. Xiaoli Sun", "NASA GSFC", true, 0, 0.5, "lra", "to2-im", SRC_TO2IM),

            // ════ TO19D (Blue Ghost 1) ════
            p("scalpss-bg1", "Stereo Cameras for Lunar Plume-Surface Studies 1.1", "SCALPSS 1.1", "camera",
              "3D images of plume-surface interaction",
              "Michelle Munk", "NASA LaRC", false, U, U, "scalpss", "to19d", SRC_TO19D),

            p("rac", "Regolith Adherence Characterization", "RAC", "sampler",
              "Dust adhesion to materials",
              null, "NASA GRC", false, U, U, "rac", "to19d", SRC_TO19D),

            p("lms", "Lunar Magnetotelluric Sounder", "LMS", "spectrometer",
              "Interior electrical conductivity",
              null, "NASA GSFC", false, U, U, "msolo", "to19d", SRC_TO19D),

            p("radpc", "Radiation Tolerant Computer", "RadPC", "computer",
              "Radiation-hardened compute performance",
              null, "NASA GSFC", false, U, U, "msolo", "to19d", SRC_TO19D),

            p("lpv", "Lunar PlanetVac", "LPV", "sampler",
              "Pneumatic regolith sample capture",
              null, "Honeybee Robotics", false, U, U, "planetvac", "to19d", SRC_TO19D),

            p("lister", "Lunar Instrumentation for Subsurface Thermal Exploration with Rapidity",
              "LISTER", "drill",
              "Heat flow from the lunar interior",
              null, "Honeybee Robotics", false, U, U, "lister", "to19d", SRC_TO19D),

            p("lexi", "Lunar Environment heliospheric X-ray Imager", "LEXI", "camera",
              "Solar wind-magnetosphere interaction",
              null, "NASA GSFC", false, U, U, "scalpss", "to19d", SRC_TO19D),

            p("moonlight", "MoonLIGHT Laser Retroreflector (ESA)", "MoonLIGHT", "retroreflector",
              "Precise Earth-Moon distance (ESA)",
              null, "ESA / INFN", true, 0, U, "lra", "to19d", SRC_TO19D),

            p("lra-bg1", "Laser Retroreflector Array", "LRA", "retroreflector",
              "Precise distances from orbit",
              "Dr. Xiaoli Sun", "NASA GSFC", true, 0, 0.5, "lra", "to19d", SRC_TO19D),

            p("stereo-bg1", "Stereo Camera", "StereoCAM", "camera",
              "Surface context imagery",
              null, "NASA GSFC", false, U, U, "scalpss", "to19d", SRC_TO19D),

            // ════ TO-PRIME1 (IM-2 Athena) ════
            p("msolo", "Mass Spectrometer Observing Lunar Operations", "MSolo", "spectrometer",
              "Volatile species at the surface (water, CO2)",
              null, "NASA KSC", false, U, U, "msolo", "to-prime1", SRC_PRIME1),

            p("lra-im2", "Laser Retroreflector Array", "LRA", "retroreflector",
              "Precise distances from orbit",
              "Dr. Xiaoli Sun", "NASA GSFC", true, 0, 0.5, "lra", "to-prime1", SRC_PRIME1),

            p("micro-nova", "Micro-Nova hopper", "Micro-Nova", "nav",
              "Terrain mobility demonstration",
              null, "Intuitive Machines", false, U, U, "scalpss", "to-prime1", SRC_PRIME1),

            // ════ CP-11 (IM-3) ════
            p("lusee-night", "Lunar Surface Electromagnetics Experiment-Night", "LuSEE-Night", "radio",
              "Low-frequency radio astronomy from the lunar farside",
              null, "Brookhaven / NASA GSFC", false, U, U, "msolo", "cp-11", SRC_CP11),

            p("lra-im3", "Laser Retroreflector Array", "LRA", "retroreflector",
              "Precise distances from orbit",
              "Dr. Xiaoli Sun", "NASA GSFC", true, 0, 0.5, "lra", "cp-11", SRC_CP11),

            p("scalpss-im3", "SCALPSS", "SCALPSS", "camera",
              "Plume-surface imaging",
              "Michelle Munk", "NASA LaRC", false, U, U, "scalpss", "cp-11", SRC_CP11),

            p("mag-im3", "Lunar Surface Magnetometer", "MAG", "spectrometer",
              "Reiner Gamma magnetic anomaly characterization",
              null, "NASA GSFC", false, U, U, "msolo", "cp-11", SRC_CP11),

            // ════ TO20A (Griffin 1) — placeholder payloads ════
            p("trident", "The Regolith and Ice Drill for Exploring New Terrain", "TRIDENT", "drill",
              "Subsurface ice sampling",
              null, "Honeybee Robotics", false, U, U, "lister", "to20a", SRC_TO20A),

            p("msolo-griffin", "MSolo (Griffin)", "MSolo", "spectrometer",
              "Volatile species near south pole",
              null, "NASA KSC", false, U, U, "msolo", "to20a", SRC_TO20A),

            p("lra-griffin", "Laser Retroreflector Array", "LRA", "retroreflector",
              "Precise distances from orbit",
              "Dr. Xiaoli Sun", "NASA GSFC", true, 0, 0.5, "lra", "to20a", SRC_TO20A),

            p("nss-griffin", "Neutron Spectrometer System (Griffin)", "NSS", "spectrometer",
              "Hydrogen abundance near south pole",
              null, "NASA ARC", false, U, U, "msolo", "to20a", SRC_TO20A)
        ));
    }
}
