package story;

import java.util.List;

/**
 * The four adoptable story pets — real CLPS payload instruments (same set as
 * {@code catalog.json} pets, engine care pets, and {@code demos/js-pets}).
 *
 * <ul>
 *   <li>LISTER — heat-flow drill (Blue Ghost 1)</li>
 *   <li>Retro / LRA — passive laser retroreflector</li>
 *   <li>EDS — electrodynamic dust shield (Blue Ghost 1)</li>
 *   <li>Nodey / LN-1 — navigation beacon (IM-1 @ Malapert A)</li>
 * </ul>
 */
public final class Pets {

    public static final String LISTER = "LISTER";
    public static final String RETRO = "LRA";
    public static final String EDS = "EDS";
    public static final String NODEY = "LN-1";

    public static final List<Pet> ALL = List.of(
            new Pet(LISTER, "LISTER", "Honeybee Robotics", "blue-ghost-1", "🔩",
                    "Hungry heat-flow drill. Measures warmth under the regolith — needs power at night.",
                    MissionMoments.MARE_CRISIUM, false,
                    List.of("Drilled to measure heat flowing from the Moon's interior",
                            "Needed lander power to keep working after sunset"),
                    "LISTER heat-flow probe"),
            new Pet(RETRO, "Retro", "NASA GSFC", "im-1", "💠",
                    "Quiet corner-cube mirror. Needs no power, so it sleeps through lunar night.",
                    MissionMoments.MALAPERT_A, true,
                    List.of("Bounced laser light so orbiters could pin down the lander",
                            "Slept through the night — passive optics draw zero watts"),
                    "LRA laser retroreflector"),
            new Pet(EDS, "EDS", "NASA", "blue-ghost-1", "✨",
                    "Dust-shield panel. Electric fields lift lunar dust — only while power lasts.",
                    MissionMoments.MARE_CRISIUM, false,
                    List.of("Lifted lunar dust off glass and radiators with electric fields",
                            "Stopped cleaning when the Sun set and power ran low"),
                    "EDS electrodynamic dust shield"),
            new Pet(NODEY, "Nodey", "Intuitive Machines", "im-1", "📡",
                    "Chatty navigation beacon. Prefers waiting for Earth before it transmits.",
                    MissionMoments.MALAPERT_A, false,
                    List.of("Lit a navigation beacon on the Moon for future explorers",
                            "Backed up its lander's own navigation system"),
                    "LN-1 navigation beacon"));

    public static Pet find(String id) {
        return ALL.stream().filter(p -> p.id().equalsIgnoreCase(id)).findFirst().orElse(ALL.get(0));
    }

    private Pets() {}
}
