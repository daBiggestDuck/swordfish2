package engine;

/**
 * Something that happened, for the story (pop-ups) and pets (animations) branches.
 *
 * Types: powerLow, powerCritical, powerRecovered, tooHot, tooCold, comfortable, dusty,
 * heaterOn, heaterOff, shadeOn, shadeOff, cleaned, drilled, dustTest, ping, dataSent,
 * milestone, sunset, moodChanged, fainted, won.
 *
 * @param detail extra info (milestone id, depth, amount, "from->to" for moods); may be null
 * @param hour   game hour when it happened
 */
public record Event(String type, String detail, double hour) {

    public String toJson() {
        return Json.obj("type", Json.q(type), "detail", Json.q(detail), "hour", Json.n(hour));
    }
}
