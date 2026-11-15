package engine;

import java.util.List;

/**
 * A landing site. Ids match the story branch (MARE_CRISIUM, MALAPERT_A, ...).
 *
 * @param dayMaxK    hottest surface temperature at local noon, in Kelvin
 * @param nightMinK  coldest surface temperature at night, in Kelvin
 * @param sunlight   0..1 how well solar panels charge here (1 = sun high overhead, 0 = never lit)
 * @param sourceIds  where the temperature and sunlight numbers come from (see {@link Sources})
 */
public record Site(
        String id,
        String name,
        String region,
        double dayMaxK,
        double nightMinK,
        double sunlight,
        String note,
        List<String> sourceIds) {

    public String toJson() {
        return Json.obj(
                "id", Json.q(id), "name", Json.q(name), "region", Json.q(region),
                "dayMaxK", Json.n(dayMaxK), "nightMinK", Json.n(nightMinK),
                "sunlight", Json.n(sunlight), "note", Json.q(note),
                "sourceIds", Json.array(sourceIds, Json::q));
    }
}
