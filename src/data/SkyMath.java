package data;

/**
 * Computes Sun and Earth positions relative to a lunar surface site.
 *
 * The single source of truth for power, thermal, and comms geometry.
 * Both the map branch and the engine branch must import this — never
 * re-implement the formulas.
 *
 * Inputs: sub-solar and sub-Earth selenographic coordinates from
 * JPL Horizons (QUANTITIES='14,15' for body 301 as seen from 399).
 *
 * Reference frame: selenographic longitude (east-positive),
 * latitude (planetocentric).
 */
public final class SkyMath {

    private SkyMath() {}

    private static final double DEG = Math.PI / 180.0;

    // ── Core geometry ──────────────────────────────────────────

    /**
     * Elevation of a body above the horizon at a site, assuming a
     * spherical Moon (no terrain). Returns degrees; negative = below horizon.
     *
     * @param siteLat   site latitude  (deg, south negative)
     * @param siteLon   site longitude (deg, east positive)
     * @param subLat    sub-body latitude  (deg)
     * @param subLon    sub-body longitude (deg)
     */
    public static double elevation(double siteLat, double siteLon,
                                   double subLat, double subLon) {
        double sinH = Math.sin(siteLat * DEG) * Math.sin(subLat * DEG)
                     + Math.cos(siteLat * DEG) * Math.cos(subLat * DEG)
                       * Math.cos((subLon - siteLon) * DEG);
        return Math.asin(clamp(sinH, -1, 1)) / DEG;
    }

    /**
     * Azimuth of a body as seen from a site.
     * 0° = north, 90° = east, 180° = south, 270° = west.
     */
    public static double azimuth(double siteLat, double siteLon,
                                 double subLat, double subLon) {
        double dLon = (subLon - siteLon) * DEG;
        double y = Math.sin(dLon) * Math.cos(subLat * DEG);
        double x = Math.sin(subLat * DEG) * Math.cos(siteLat * DEG)
                 - Math.cos(subLat * DEG) * Math.sin(siteLat * DEG) * Math.cos(dLon);
        double az = Math.atan2(y, x) / DEG;
        return (az + 360) % 360;
    }

    /**
     * Sun elevation adjusted for a terrain horizon profile.
     * Returns the margin above the local horizon (degrees).
     * Positive = sun visible; negative = occluded by terrain.
     *
     * @param horizonProfile  180-bin array of horizon elevation angles (deg),
     *                        where bin i covers azimuth [i*2, i*2+2) degrees
     * @param sunElev         flat-model sun elevation (deg)
     * @param sunAz           sun azimuth (deg)
     */
    public static double terrainAdjustedMargin(double[] horizonProfile,
                                                double sunElev, double sunAz) {
        if (horizonProfile == null) return sunElev; // no terrain data
        int bin = ((int) Math.round(sunAz / 2.0)) % 180;
        if (bin < 0) bin += 180;
        return sunElev - horizonProfile[bin];
    }

    // ── Derived metrics ────────────────────────────────────────

    /**
     * Power factor: 0 when sun is at or below horizon, scales with sin(elevation).
     * This is the projection factor for a horizontal solar panel.
     */
    public static double powerFactor(double sunElevDeg) {
        if (sunElevDeg <= 0) return 0;
        return Math.sin(sunElevDeg * DEG);
    }

    /**
     * Power factor with terrain adjustment.
     */
    public static double powerFactorTerrain(double sunElevDeg, double sunAzDeg,
                                             double[] horizonProfile) {
        double margin = terrainAdjustedMargin(horizonProfile, sunElevDeg, sunAzDeg);
        if (margin <= 0) return 0;
        return Math.sin(margin * DEG);
    }

    /**
     * Whether direct-to-Earth communication is possible.
     * Requires Earth > 0° (or above terrain horizon).
     */
    public static boolean earthVisible(double earthElevDeg) {
        return earthElevDeg > 0;
    }

    /**
     * Simple thermal estimate (Kelvin).
     * One-layer radiative equilibrium + heater floor.
     *
     * T^4 = (S * (1-A) * cos(z)) / (sigma * epsilon)
     *
     * S     = 1361 W/m² (solar constant)
     * A     = 0.12 (typical lunar albedo)
     * sigma = 5.67e-8 W/(m²·K⁴)
     * epsilon = 0.95
     *
     * Calibrate against Diviner extremes per site.
     * Label: "simple thermal model calibrated to Diviner".
     */
    public static double surfaceTemperatureK(double sunElevDeg) {
        double S = 1361.0;
        double A = 0.12;
        double sigma = 5.670374419e-8;
        double epsilon = 0.95;

        if (sunElevDeg <= 0) {
            return 100.0; // approximate night temp (Diviner: ~95-110 K)
        }
        double cosZ = Math.sin(sunElevDeg * DEG); // zenith angle complement
        double t4 = (S * (1 - A) * cosZ) / (sigma * epsilon);
        double t = Math.pow(t4, 0.25);
        return Math.max(t, 100.0); // floor at night temp
        // Note: real polar sites can go below 40 K in PSRs.
        // This model is for the pet game, not for science.
    }

    // ── Batch computation ──────────────────────────────────────

    /**
     * Compute illumination fraction over a set of ephemeris rows.
     *
     * @param siteLat          deg
     * @param siteLon          deg
     * @param subSolarLon      array of sub-solar longitudes (deg)
     * @param subSolarLat      array of sub-solar latitudes  (deg)
     * @param horizonProfile   180-bin horizon (deg), or null for flat model
     * @return fraction [0,1] of timesteps where sun is above terrain horizon
     */
    public static double illuminationFraction(
            double siteLat, double siteLon,
            double[] subSolarLon, double[] subSolarLat,
            double[] horizonProfile) {
        int lit = 0;
        int n = subSolarLon.length;
        for (int i = 0; i < n; i++) {
            double elev = elevation(siteLat, siteLon, subSolarLat[i], subSolarLon[i]);
            double az   = azimuth(siteLat, siteLon, subSolarLat[i], subSolarLon[i]);
            double margin = terrainAdjustedMargin(horizonProfile, elev, az);
            if (margin > 0) lit++;
        }
        return (double) lit / n;
    }

    /**
     * Compute Earth-visibility fraction over a set of ephemeris rows.
     */
    public static double earthVisibilityFraction(
            double siteLat, double siteLon,
            double[] subEarthLon, double[] subEarthLat) {
        int vis = 0;
        int n = subEarthLon.length;
        for (int i = 0; i < n; i++) {
            double elev = elevation(siteLat, siteLon, subEarthLat[i], subEarthLon[i]);
            if (elev > 0) vis++;
        }
        return (double) vis / n;
    }

    /**
     * Find the index of the next sunrise/sunset transition from a given start.
     * Returns -1 if not found within the array.
     *
     * @param rising  true = find next sunrise, false = find next sunset
     */
    public static int findTransition(
            double siteLat, double siteLon,
            double[] subSolarLon, double[] subSolarLat,
            double[] horizonProfile,
            int startIndex, boolean rising) {
        if (startIndex >= subSolarLon.length - 1) return -1;
        for (int i = startIndex; i < subSolarLon.length - 1; i++) {
            double e0 = elevation(siteLat, siteLon, subSolarLat[i], subSolarLon[i]);
            double e1 = elevation(siteLat, siteLon, subSolarLat[i+1], subSolarLon[i+1]);
            double a0 = azimuth(siteLat, siteLon, subSolarLat[i], subSolarLon[i]);
            double a1 = azimuth(siteLat, siteLon, subSolarLat[i+1], subSolarLon[i+1]);
            double m0 = terrainAdjustedMargin(horizonProfile, e0, a0);
            double m1 = terrainAdjustedMargin(horizonProfile, e1, a1);
            if (rising && m0 <= 0 && m1 > 0) return i + 1;
            if (!rising && m0 > 0 && m1 <= 0) return i + 1;
        }
        return -1;
    }

    // ── Utility ────────────────────────────────────────────────

    private static double clamp(double v, double min, double max) {
        return Math.max(min, Math.min(max, v));
    }
}
