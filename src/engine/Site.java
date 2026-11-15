package engine;

import java.util.List;

/**
 * A landing site. Ids match the story branch (MARE_CRISIUM, MALAPERT_A, ...).
 *
 * @param lat            latitude in degrees, north positive
 * @param lon            longitude in degrees, east positive (-180..180)
 * @param dayMaxK        hottest surface temperature at local noon, in Kelvin
 * @param nightMinK      coldest surface temperature at night, in Kelvin
 * @param sunlight       0..1 how well solar panels charge here (1 = sun high overhead, 0 = never lit)
 * @param coordSourceId  where the latitude / longitude come from (see {@link Sources})
 * @param sourceIds      where the temperature and sunlight numbers come from (see {@link Sources})
 */
public record Site(
        String id,
        String name,
        String region,
        double lat,
        double lon,
        double dayMaxK,
        double nightMinK,
        double sunlight,
        String note,
        String coordSourceId,
        List<String> sourceIds) {

    /** Great-circle distance over the lunar surface, in km (haversine on a sphere of the Moon's mean radius). */
    public double distanceKm(Site other) {
        double p1 = Math.toRadians(lat), p2 = Math.toRadians(other.lat);
        double dp = p2 - p1;
        double dl = Math.toRadians(other.lon - lon);
        double a = Math.sin(dp / 2) * Math.sin(dp / 2)
                + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
        return 2 * Rules.MOON_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
    }

    public String toJson() {
        return Json.obj(
                "id", Json.q(id), "name", Json.q(name), "region", Json.q(region),
                "lat", Json.n4(lat), "lon", Json.n4(lon),
                "dayMaxK", Json.n(dayMaxK), "nightMinK", Json.n(nightMinK),
                "sunlight", Json.n(sunlight), "note", Json.q(note),
                "coordSourceId", Json.q(coordSourceId),
                "sourceIds", Json.array(sourceIds, Json::q));
    }
}
