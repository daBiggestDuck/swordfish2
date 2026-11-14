package story;

import java.util.List;

/**
 * A pet is a real CLPS lander turned cute.
 *
 * @param id            stable key used by the API and moments (e.g. "BLUE_GHOST")
 * @param name          default pet name
 * @param vendor        company that built the real lander
 * @param missionId     id of the matching entry in {@link Missions}
 * @param face          emoji placeholder until the pets branch ships real art
 * @param tagline       one line shown under the picker
 * @param defaultSite   site to preselect, or null when the pet has no fixed home
 * @param sleepsAtNight true if the pet naps through the lunar night instead of shivering
 * @param science       lines for the Pet Passport's "science sent home"
 */
public record Pet(
        String id,
        String name,
        String vendor,
        String missionId,
        String face,
        String tagline,
        String defaultSite,
        boolean sleepsAtNight,
        List<String> science) {

    /** Text for the Passport, e.g. "Blue Ghost Mission 1 (Firefly Aerospace)". */
    public String label(String missionName) {
        return missionName + " (" + vendor + ")";
    }

    public String toJson() {
        return "{\"id\":" + Json.q(id) + ",\"name\":" + Json.q(name) + ",\"vendor\":" + Json.q(vendor)
                + ",\"missionId\":" + Json.q(missionId) + ",\"face\":" + Json.q(face)
                + ",\"tagline\":" + Json.q(tagline) + ",\"defaultSite\":" + Json.q(defaultSite)
                + ",\"sleepsAtNight\":" + sleepsAtNight + "}";
    }
}
