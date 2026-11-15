package map;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Selenographic spherical geometry, LOLA horizon ray-lookup, solar power, Diviner-calibrated
 * thermal estimation, and operational window computations driven by JPL Horizons ephemeris.
 */
public final class LunarMath {

    public static final double LUNAR_RADIUS_KM = 1737.4;
    private static final double SOLAR_CONSTANT_W_M2 = 1361.0;
    private static final double STEFAN_BOLTZMANN = 5.670374419e-8;

    private LunarMath() {}

    public static double clamp(double v, double lo, double hi) {
        return Math.max(lo, Math.min(hi, v));
    }

    public static double round1(double v) {
        return Math.round(v * 10.0) / 10.0;
    }

    public static double round2(double v) {
        return Math.round(v * 100.0) / 100.0;
    }

    /**
     * Elevation angle above the flat local lunar horizon (degrees) for a celestial body
     * whose sub-lunar point is (subLatDeg, subLonDeg) viewed from (siteLatDeg, siteLonDeg).
     * Formula: sin(h) = sin(phi)*sin(delta) + cos(phi)*cos(delta)*cos(lambda_sub - lambda_site)
     */
    public static double elevationDeg(double siteLatDeg, double siteLonDeg, double subLatDeg, double subLonDeg) {
        double phi = Math.toRadians(siteLatDeg);
        double delta = Math.toRadians(subLatDeg);
        double dLon = Math.toRadians(subLonDeg - siteLonDeg);
        double sinH = Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.cos(dLon);
        return Math.toDegrees(Math.asin(clamp(sinH, -1.0, 1.0)));
    }

    /**
     * Azimuth clockwise from Lunar North (0=N, 90=E, 180=S, 270=W) from site to sub-lunar point.
     */
    public static double azimuthDeg(double siteLatDeg, double siteLonDeg, double subLatDeg, double subLonDeg) {
        double phi1 = Math.toRadians(siteLatDeg);
        double phi2 = Math.toRadians(subLatDeg);
        double dLon = Math.toRadians(subLonDeg - siteLonDeg);
        double y = Math.sin(dLon) * Math.cos(phi2);
        double x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
        double deg = Math.toDegrees(Math.atan2(y, x));
        return ((deg % 360.0) + 360.0) % 360.0;
    }

    /**
     * Linearly interpolate local terrain horizon elevation (degrees) from a 36-bin (10 deg) LOLA profile.
     */
    public static double horizonElevationAtAzimuth(List<Double> horizonBins, double azimuthDeg) {
        if (horizonBins == null || horizonBins.isEmpty()) return 0.0;
        int n = horizonBins.size();
        double binWidth = 360.0 / n;
        double normAz = ((azimuthDeg % 360.0) + 360.0) % 360.0;
        double exactIdx = normAz / binWidth;
        int i0 = ((int) Math.floor(exactIdx)) % n;
        int i1 = (i0 + 1) % n;
        double frac = exactIdx - Math.floor(exactIdx);
        return horizonBins.get(i0) * (1.0 - frac) + horizonBins.get(i1) * frac;
    }

    /**
     * Great-circle surface distance on the Moon (km) using Haversine formula with R = 1737.4 km.
     */
    public static double greatCircleDistanceKm(double lat1Deg, double lon1Deg, double lat2Deg, double lon2Deg) {
        double phi1 = Math.toRadians(lat1Deg);
        double phi2 = Math.toRadians(lat2Deg);
        double dPhi = Math.toRadians(lat2Deg - lat1Deg);
        double dLon = Math.toRadians(lon2Deg - lon1Deg);
        double a = Math.sin(dPhi / 2.0) * Math.sin(dPhi / 2.0)
                + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLon / 2.0) * Math.sin(dLon / 2.0);
        double c = 2.0 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0.0, 1.0 - a)));
        return LUNAR_RADIUS_KM * c;
    }

    /**
     * Approximate horizontal solar panel output (% of peak) accounting for terrain visibility.
     */
    public static double solarPanelPowerPct(double sunElevDeg, double horizonElevDeg, double slopeDeg) {
        if (sunElevDeg <= horizonElevDeg) return 0.0;
        // Effective incidence accounts for slight grazing gain on tilted polar arrays
        double effectiveAngle = clamp(sunElevDeg + Math.min(12.0, slopeDeg * 0.25), 0.0, 90.0);
        return clamp(Math.sin(Math.toRadians(effectiveAngle)) * 100.0, 0.0, 100.0);
    }

    /**
     * One-layer radiative equilibrium temperature model calibrated to Diviner site extrema.
     */
    public static double calibratedSurfaceTempK(double sunElevDeg, boolean sunlit, double albedo,
                                              double divinerMinK, double divinerMaxK) {
        if (!sunlit || sunElevDeg <= 0.0) {
            return divinerMinK;
        }
        double sinInc = Math.sin(Math.toRadians(clamp(sunElevDeg, 0.5, 90.0)));
        double emissivity = 0.95;
        double absorbed = SOLAR_CONSTANT_W_M2 * (1.0 - albedo) * sinInc;
        double tEq = Math.pow(absorbed / (STEFAN_BOLTZMANN * emissivity), 0.25);
        return clamp(tEq, divinerMinK, divinerMaxK);
    }

    /**
     * Compute full 178-sample operational sky series and summary metrics for a landing site.
     */
    public static Map<String, Object> computeSiteSky(MapModels.LandingSite site,
                                                   List<MapModels.EphemerisSample> ephemeris,
                                                   int currentIndex) {
        int n = ephemeris.size();
        int safeIdx = n == 0 ? 0 : Math.max(0, Math.min(n - 1, currentIndex));

        List<Double> sunElevSeries = new ArrayList<>(n);
        List<Double> sunAzSeries = new ArrayList<>(n);
        List<Double> earthElevSeries = new ArrayList<>(n);
        List<Double> earthAzSeries = new ArrayList<>(n);
        List<Double> powerSeries = new ArrayList<>(n);
        List<Boolean> sunlitSeries = new ArrayList<>(n);
        List<Boolean> dteSeries = new ArrayList<>(n);
        List<Boolean> dualSeries = new ArrayList<>(n);

        int sunlitCount = 0;
        int flatSunlitCount = 0;
        int dteCount = 0;
        int dualCount = 0;
        double powerSum = 0.0;
        double stepHours = 4.0;

        for (MapModels.EphemerisSample ep : ephemeris) {
            double sunEl = elevationDeg(site.lat(), site.lon(), ep.sunSubLat(), ep.sunSubLon());
            double sunAz = azimuthDeg(site.lat(), site.lon(), ep.sunSubLat(), ep.sunSubLon());
            double earthEl = elevationDeg(site.lat(), site.lon(), ep.obsSubLat(), ep.obsSubLon());
            double earthAz = azimuthDeg(site.lat(), site.lon(), ep.obsSubLat(), ep.obsSubLon());

            double sunHoriz = horizonElevationAtAzimuth(site.horizonProfileDeg(), sunAz);
            double earthHoriz = horizonElevationAtAzimuth(site.horizonProfileDeg(), earthAz);
            double samplePwr = solarPanelPowerPct(sunEl, sunHoriz, site.slopeDegrees());

            boolean isFlatSun = sunEl > 0.0;
            boolean isSunlit = sunEl > sunHoriz;
            boolean isDte = earthEl > earthHoriz && earthEl > -0.5;
            boolean isDual = isSunlit && isDte;

            if (isFlatSun) flatSunlitCount++;
            if (isSunlit) sunlitCount++;
            if (isDte) dteCount++;
            if (isDual) dualCount++;
            powerSum += samplePwr;

            sunElevSeries.add(round1(sunEl));
            sunAzSeries.add(round1(sunAz));
            earthElevSeries.add(round1(earthEl));
            earthAzSeries.add(round1(earthAz));
            powerSeries.add(samplePwr);
            sunlitSeries.add(isSunlit);
            dteSeries.add(isDte);
            dualSeries.add(isDual);
        }

        double currentSunEl = n > 0 ? sunElevSeries.get(safeIdx) : 0.0;
        double currentSunAz = n > 0 ? sunAzSeries.get(safeIdx) : 0.0;
        double currentEarthEl = n > 0 ? earthElevSeries.get(safeIdx) : 0.0;
        double currentEarthAz = n > 0 ? earthAzSeries.get(safeIdx) : 0.0;
        boolean currentSunlit = n > 0 && sunlitSeries.get(safeIdx);
        boolean currentDte = n > 0 && dteSeries.get(safeIdx);
        boolean currentDual = n > 0 && dualSeries.get(safeIdx);

        double currentHorizonAtSun = horizonElevationAtAzimuth(site.horizonProfileDeg(), currentSunAz);
        double powerPct = solarPanelPowerPct(currentSunEl, currentHorizonAtSun, site.slopeDegrees());
        double tempK = calibratedSurfaceTempK(currentSunEl, currentSunlit, site.albedo(),
                site.divinerMinTempK(), site.divinerMaxTempK());

        String nextSunset = findNextTransition(sunlitSeries, safeIdx, false, stepHours);
        String nextSunrise = findNextTransition(sunlitSeries, safeIdx, true, stepHours);
        String nextEarthset = findNextTransition(dteSeries, safeIdx, false, stepHours);

        String operationalState;
        if (currentDual) operationalState = "Optimal";
        else if (currentSunlit) operationalState = "Sunlit Only (No DTE)";
        else if (currentDte) operationalState = "Night Survival (DTE OK)";
        else operationalState = "Blackout (No Sun / No DTE)";

        double sunlitHours = sunlitCount * stepHours;
        double dteCoveragePct = n > 0 ? round1((dteCount * 100.0) / n) : 0.0;
        double sunlitTerrainPct = n > 0 ? round1((sunlitCount * 100.0) / n) : site.illuminationTerrainPct();
        double sunlitFlatPct = n > 0 ? round1((flatSunlitCount * 100.0) / n) : site.illuminationFlatPct();
        double dualViableHours = dualCount * stepHours;
        double avgPowerPct = n > 0 ? round1(powerSum / n) : 0.0;
        String startDate = n > 0 ? toIsoDate(ephemeris.get(0).timestampUtc()) : "2026-11-10";
        String bestStartDate = computeBestStartDate(ephemeris, powerSeries, startDate);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", site.id());
        out.put("name", site.name());
        out.put("lat", site.lat());
        out.put("lon", site.lon());
        out.put("sampleIndex", safeIdx);
        out.put("sampleCount", n);
        out.put("resolutionHours", stepHours);
        out.put("timestampUtc", n > 0 ? ephemeris.get(safeIdx).timestampUtc() : "");
        out.put("current", Map.ofEntries(
                Map.entry("sunElevationDeg", currentSunEl),
                Map.entry("sunAzimuthDeg", currentSunAz),
                Map.entry("sunlit", currentSunlit),
                Map.entry("earthElevationDeg", currentEarthEl),
                Map.entry("earthAzimuthDeg", currentEarthAz),
                Map.entry("earthVisible", currentDte),
                Map.entry("dualViable", currentDual),
                Map.entry("operationalState", operationalState),
                Map.entry("panelPowerPct", round1(powerPct)),
                Map.entry("surfaceTempK", round1(tempK)),
                Map.entry("nextSunset", nextSunset),
                Map.entry("nextSunrise", nextSunrise),
                Map.entry("nextEarthset", nextEarthset)
        ));
        out.put("windows", Map.of(
                "sunlitHours", round1(sunlitHours),
                "sunlitDaysText", formatDurationDaysHours(sunlitHours),
                "dteCoveragePct", dteCoveragePct,
                "dualViableHours", round1(dualViableHours),
                "dualViableDaysText", formatDurationDaysHours(dualViableHours),
                "computedSunlitTerrainPct", sunlitTerrainPct,
                "computedSunlitFlatPct", sunlitFlatPct
        ));
        // Fields compatible with origin/story SkyModel contract:
        out.put("earthElevation", currentEarthEl);
        out.put("earthVisible", currentDte);
        out.put("startDate", startDate);
        out.put("bestStartDate", bestStartDate);
        out.put("gameDays", 14.77);
        out.put("monthDays", 29.53);
        out.put("avgPowerPct", avgPowerPct);
        out.put("sun", sunElevSeries);
        out.put("sunAzimuth", sunAzSeries);
        out.put("earth", earthElevSeries);
        out.put("earthAzimuth", earthAzSeries);
        out.put("horizonProfileDeg", site.horizonProfileDeg());
        out.put("timestamps", ephemeris.stream().map(MapModels.EphemerisSample::timestampUtc).toList());
        out.put("model", "JPL Horizons DE441 ephemeris + LOLA DEM 36-bin horizon profile");
        return out;
    }

    private static String toIsoDate(String horizonsTimestamp) {
        if (horizonsTimestamp == null || horizonsTimestamp.isBlank()) return "2026-11-10";
        String datePart = horizonsTimestamp.trim().split("\\s+")[0];
        String[] ymd = datePart.split("-");
        if (ymd.length != 3) return "2026-11-10";
        String mon = switch (ymd[1]) {
            case "Jan" -> "01";
            case "Feb" -> "02";
            case "Mar" -> "03";
            case "Apr" -> "04";
            case "May" -> "05";
            case "Jun" -> "06";
            case "Jul" -> "07";
            case "Aug" -> "08";
            case "Sep" -> "09";
            case "Oct" -> "10";
            case "Nov" -> "11";
            case "Dec" -> "12";
            default -> "11";
        };
        return ymd[0] + "-" + mon + "-" + (ymd[2].length() == 1 ? "0" + ymd[2] : ymd[2]);
    }

    private static String computeBestStartDate(List<MapModels.EphemerisSample> ephemeris,
                                               List<Double> powerSeries,
                                               String fallback) {
        int n = ephemeris.size();
        if (n == 0 || powerSeries.size() != n) return fallback;
        int win = Math.max(1, n / 2);
        int bestIdx = 0;
        double bestSum = -1.0;
        for (int start = 0; start < n; start++) {
            double sum = 0.0;
            for (int k = 0; k < win; k++) {
                sum += powerSeries.get((start + k) % n);
            }
            if (sum > bestSum) {
                bestSum = sum;
                bestIdx = start;
            }
        }
        return toIsoDate(ephemeris.get(bestIdx).timestampUtc());
    }

    private static String findNextTransition(List<Boolean> series, int startIdx, boolean targetState, double stepHours) {
        if (series.size() < 2) return "No event";
        for (int offset = 1; offset < series.size(); offset++) {
            int prevIdx = (startIdx + offset - 1) % series.size();
            int currIdx = (startIdx + offset) % series.size();
            if (series.get(prevIdx) != targetState && series.get(currIdx) == targetState) {
                return formatDurationDaysHours(offset * stepHours);
            }
        }
        return "No event";
    }

    public static String formatDurationDaysHours(double totalHours) {
        int rounded = (int) Math.round(totalHours);
        int days = rounded / 24;
        int hours = rounded % 24;
        return days + "d " + hours + "h";
    }

    /**
     * Evaluate environmental factors, solar lighting, DTE comms, terrain hazards, and Payload Pet
     * impact for any arbitrary cursor-selected point (lat, lon) on the Moon before confirming a drop.
     */
    @SuppressWarnings("unchecked")
    public static Map<String, Object> evaluateDropPoint(MapModels.DatasetBundle bundle,
                                                      double rawLat,
                                                      double rawLon,
                                                      int sampleIndex) {
        double lat = clamp(rawLat, -90.0, 90.0);
        double lon = ((((rawLon + 180.0) % 360.0) + 360.0) % 360.0) - 180.0;

        MapModels.LandingSite nearestSite = null;
        double nearestSiteKm = Double.MAX_VALUE;
        for (MapModels.LandingSite s : bundle.sites()) {
            double d = greatCircleDistanceKm(lat, lon, s.lat(), s.lon());
            if (d < nearestSiteKm) {
                nearestSiteKm = d;
                nearestSite = s;
            }
        }

        MapModels.PsrZone nearestPsr = null;
        double nearestPsrKm = Double.MAX_VALUE;
        for (MapModels.PsrZone psr : bundle.psrZones()) {
            double d = Math.max(0.0, greatCircleDistanceKm(lat, lon, psr.centerLat(), psr.centerLon()) - psr.radiusKm());
            if (d < nearestPsrKm) {
                nearestPsrKm = d;
                nearestPsr = psr;
            }
        }
        if (nearestPsrKm == Double.MAX_VALUE) nearestPsrKm = 0.0;

        boolean matchedKnownSite = nearestSite != null && nearestSiteKm <= 35.0;
        String region = lat <= -78.0 ? "SOUTH_POLE" : (Math.abs(lon) > 90.0 ? "FAR_SIDE" : "NEAR_SIDE");

        double elevM;
        double slopeDeg;
        double roughness;
        double minTempK;
        double maxTempK;
        double albedo;
        String terrainSummary;
        String lightingCond;
        List<Double> horizonBins;

        QuickmapMatch matchedFeature = null;

        if (matchedKnownSite) {
            region = nearestSite.region();
            elevM = nearestSite.elevationMeters();
            slopeDeg = nearestSite.slopeDegrees();
            roughness = nearestSite.roughnessIndex();
            minTempK = nearestSite.divinerMinTempK();
            maxTempK = nearestSite.divinerMaxTempK();
            albedo = nearestSite.albedo();
            terrainSummary = nearestSite.terrainSummary();
            lightingCond = nearestSite.lightingCondition();
            horizonBins = nearestSite.horizonProfileDeg();
        } else {
            boolean insidePsr = nearestPsr != null && nearestPsrKm <= 1.0 && lat <= -78.0;
            if (insidePsr) {
                elevM = -3200.0;
                slopeDeg = 10.5;
                roughness = 0.45;
                minTempK = nearestPsr.divinerMaxTempK();
                maxTempK = 140.0;
                albedo = 0.14;
                terrainSummary = "Inside or bordering Permanently Shadowed Region (" + nearestPsr.name() + ").";
                lightingCond = "Permanently Shadowed Cold Trap";
                horizonBins = uniformHorizon(7.5);
            } else {
                if ("SOUTH_POLE".equals(region)) {
                    elevM = Math.round(1200.0 * Math.cos(Math.toRadians(lon)) + 400.0);
                    slopeDeg = round1(7.5 + 4.5 * Math.abs(Math.sin(Math.toRadians(lat * 3.0))));
                    roughness = 0.38;
                    minTempK = 65.0;
                    maxTempK = 230.0;
                    albedo = 0.14;
                    terrainSummary = "South polar cratered highlands; low solar grazing angles cast long terrain shadows.";
                    lightingCond = "Polar Grazing Illumination";
                    horizonBins = uniformHorizon(2.2);
                } else if ("FAR_SIDE".equals(region)) {
                    elevM = 1650.0;
                    slopeDeg = 6.2;
                    roughness = 0.34;
                    minTempK = 86.0;
                    maxTempK = 355.0;
                    albedo = 0.15;
                    terrainSummary = "Ancient feldspathic far-side highlands; Earth permanently below the horizon.";
                    lightingCond = "Far-Side Day/Night (No Direct Earth)";
                    horizonBins = uniformHorizon(2.4);
                } else {
                    boolean mareZone = lon > -70.0 && lon < 65.0 && lat > -35.0 && lat < 45.0;
                    elevM = mareZone ? -2200.0 : 950.0;
                    slopeDeg = mareZone ? 2.4 : 5.4;
                    roughness = mareZone ? 0.16 : 0.31;
                    minTempK = mareZone ? 95.0 : 90.0;
                    maxTempK = mareZone ? 385.0 : 370.0;
                    albedo = mareZone ? 0.09 : 0.13;
                    terrainSummary = mareZone
                            ? "Smooth near-side basaltic mare plains with gentle landing slopes."
                            : "Cratered near-side highland terrain with moderate relief.";
                    lightingCond = "Near-Side Solar Cycle (Continuous DTE)";
                    horizonBins = uniformHorizon(mareZone ? 0.6 : 1.8);
                }

                matchedFeature = matchQuickmapFeature(bundle.quickmapConfig(), lat, lon);
                if (matchedFeature != null) {
                    elevM = matchedFeature.elevationMeters();
                    slopeDeg = matchedFeature.slopeDegrees();
                    roughness = matchedFeature.roughnessIndex();
                    albedo = matchedFeature.albedo();
                    terrainSummary = matchedFeature.terrainSummary();
                    horizonBins = uniformHorizon(matchedFeature.horizonDeg());
                }
            }
        }

        String coordLabel = String.format("%.2f%s, %.2f%s",
                Math.abs(lat), lat >= 0 ? "N" : "S", Math.abs(lon), lon >= 0 ? "E" : "W");
        String id = matchedKnownSite ? nearestSite.id() : String.format("CUSTOM_%.2f_%.2f", lat, lon);
        String name = matchedKnownSite
                ? nearestSite.name()
                : matchedFeature != null
                        ? matchedFeature.featureLabel() + " (" + coordLabel + ")"
                        : "Custom Drop Point (" + coordLabel + ")";

        MapModels.LandingSite synthetic = new MapModels.LandingSite(
                id, name, name, round2(lat), round2(lon), region, elevM, slopeDeg, roughness,
                terrainSummary, lightingCond, 50.0, 50.0, "horizon-raycast",
                "JPL_HORIZONS:301 + MOON_TREK:LOLA", Math.abs(lon) > 90.0 ? 0.0 : 100.0,
                minTempK, maxTempK, albedo,
                matchedKnownSite ? nearestSite.scienceGoal() : "Custom cursor landing zone environmental evaluation.",
                List.of("RETROREFLECTOR_NAV"), horizonBins,
                nearestPsr != null ? nearestPsr.id() : "",
                nearestPsr != null ? nearestPsr.name() : "None nearby",
                round1(nearestPsrKm),
                Map.of("power", 1.0, "oxygen", 1.0, "food", 1.0, "happiness", 1.0),
                "", "", "https://trek.nasa.gov/moon/"
        );

        Map<String, Object> sky = computeSiteSky(synthetic, bundle.ephemeris(), sampleIndex);
        Map<String, Object> cur = (Map<String, Object>) sky.get("current");
        Map<String, Object> win = (Map<String, Object>) sky.get("windows");

        boolean sunlit = Boolean.TRUE.equals(cur.get("sunlit"));
        boolean dte = Boolean.TRUE.equals(cur.get("earthVisible"));
        double sunlitPct = ((Number) win.get("computedSunlitTerrainPct")).doubleValue();
        double dtePct = ((Number) win.get("dteCoveragePct")).doubleValue();

        int safetyScore = (int) Math.round(clamp(100.0 - slopeDeg * 3.8 - roughness * 30.0 + (sunlit ? 8.0 : -6.0), 15.0, 98.0));
        int scienceScore = (int) Math.round(clamp(
                ("SOUTH_POLE".equals(region) ? 70.0 : ("FAR_SIDE".equals(region) ? 75.0 : 58.0))
                        + Math.max(0.0, 28.0 - nearestPsrKm * 0.04)
                        + (matchedKnownSite ? 8.0 : 0.0),
                25.0, 99.0));
        int commsScore = (int) Math.round(clamp(dtePct, 0.0, 100.0));
        int overallScore = (int) Math.round(safetyScore * 0.4 + scienceScore * 0.35 + commsScore * 0.25);

        double powerMult = round2(clamp(1.55 - (sunlitPct / 100.0) * 0.9, 0.55, 1.8));
        double warmthMult = round2(clamp(1.65 - (minTempK / 180.0) * 0.75, 0.85, 1.85));
        double signalMult = round2(clamp(2.0 - (dtePct / 100.0) * 1.2, 0.8, 2.0));

        List<String> warnings = new ArrayList<>();
        if (!sunlit) {
            warnings.add("Currently in lunar night shadow — immediate heater & battery power draw on drop.");
        } else {
            warnings.add("Sunlit (" + cur.get("sunElevationDeg") + " deg) — solar power generation active.");
        }
        if (!dte || dtePct < 5.0) {
            warnings.add("Zero direct-to-Earth line of sight — requires orbital comm relay (e.g., Blue Ghost 2).");
        } else if (dtePct < 85.0) {
            warnings.add("Intermittent Earth visibility (" + dtePct + "%) due to polar libration & local ridge horizon.");
        }
        if (slopeDeg >= 10.0) {
            warnings.add("Steep terrain slope (" + slopeDeg + " deg) — elevated lander tip-over risk (cf. IM-1).");
        }
        if (nearestPsrKm <= 25.0) {
            warnings.add("Adjacent to water-ice cold trap (" + (nearestPsr != null ? nearestPsr.name() : "PSR") + ", " + round1(nearestPsrKm) + " km).");
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", id);
        out.put("name", name);
        out.put("matchedKnownSite", matchedKnownSite);
        out.put("nearestSiteId", nearestSite != null ? nearestSite.id() : null);
        out.put("nearestSiteName", nearestSite != null ? nearestSite.name() : null);
        out.put("nearestSiteKm", round1(nearestSiteKm));
        out.put("lat", round2(lat));
        out.put("lon", round2(lon));
        out.put("region", region);
        out.put("elevationMeters", elevM);
        out.put("slopeDegrees", slopeDeg);
        out.put("roughnessIndex", roughness);
        out.put("terrainSummary", terrainSummary);
        out.put("lightingCondition", lightingCond);
        out.put("divinerMinTempK", minTempK);
        out.put("divinerMaxTempK", maxTempK);
        out.put("nearestPsrId", nearestPsr != null ? nearestPsr.id() : "");
        out.put("nearestPsrName", nearestPsr != null ? nearestPsr.name() : "None nearby");
        out.put("nearestPsrKm", round1(nearestPsrKm));
        out.put("scores", Map.of(
                "safety", safetyScore,
                "science", scienceScore,
                "comms", commsScore,
                "overall", overallScore
        ));
        out.put("decayMultipliers", Map.of(
                "power", powerMult,
                "oxygen", warmthMult,
                "food", 1.0,
                "happiness", signalMult
        ));
        out.put("careMultipliers", Map.of(
                "power", powerMult,
                "warmth", warmthMult,
                "signal", signalMult
        ));
        out.put("warnings", warnings);
        out.put("sky", sky);
        return out;
    }

    private record QuickmapMatch(
            String featureName,
            String featureLabel,
            double elevationMeters,
            double slopeDegrees,
            double roughnessIndex,
            double albedo,
            double horizonDeg,
            String terrainSummary) {}

    private static double asDouble(Object v, double fallback) {
        return v instanceof Number n ? n.doubleValue() : fallback;
    }

    private static String asString(Object v, String fallback) {
        return v instanceof String s ? s : fallback;
    }

    private static List<Map<?, ?>> asMapList(Object v) {
        if (!(v instanceof List<?> raw)) return List.of();
        List<Map<?, ?>> out = new ArrayList<>();
        for (Object item : raw) {
            if (item instanceof Map<?, ?> m) out.add(m);
        }
        return out;
    }

    private static QuickmapMatch matchQuickmapFeature(Map<String, Object> quickmap, double lat, double lon) {
        if (quickmap == null || quickmap.isEmpty()) return null;

        List<Map<?, ?>> craters = asMapList(quickmap.get("cratersAndMassifs"));
        Map<?, ?> bestCrater = null;
        double bestCraterNormR = Double.POSITIVE_INFINITY;
        double bestCraterRadiusKm = 0.0;

        for (Map<?, ?> c : craters) {
            double cLat = asDouble(c.get("lat"), 0.0);
            double cLon = asDouble(c.get("lon"), 0.0);
            double distKm = greatCircleDistanceKm(lat, lon, cLat, cLon);
            double radiusKm = Math.max(8.0, asDouble(c.get("radiusDeg"), 1.2) * 30.3233);
            if (distKm <= radiusKm * 1.35) {
                double normR = distKm / radiusKm;
                if (normR < bestCraterNormR) {
                    bestCraterNormR = normR;
                    bestCrater = c;
                    bestCraterRadiusKm = radiusKm;
                }
            }
        }

        if (bestCrater != null) {
            String fName = asString(bestCrater.get("name"), "Lunar Crater");
            String type = asString(bestCrater.get("type"), "crater");
            String albedoTag = asString(bestCrater.get("albedo"), "");
            double normR = bestCraterNormR;
            double radiusKm = bestCraterRadiusKm;

            if ("massif-arc".equals(type) || "polar-massif".equals(type)
                    || "plateau".equals(type) || "volcanic-dome".equals(type)) {
                double elevKm = asDouble(bestCrater.get("elevKm"), asDouble(bestCrater.get("rimKm"), 3.0));
                if (elevKm == 0.0) elevKm = asDouble(bestCrater.get("rimKm"), 3.0);
                double elevationMeters = Math.round(elevKm * 1000.0 * Math.max(0.4, 1.0 - normR * 0.45));
                double slopeDeg = round1(8.5 + asDouble(bestCrater.get("elevKm"), 2.5) * 1.4);
                double albedo = ("plateau".equals(type) || "volcanic-dome".equals(type)) ? 0.13 : 0.16;
                String summary = String.format("%s (%s); LOLA relief ~%.2f km with unobstructed ridge horizon.",
                        fName, type.replace('-', ' '), elevationMeters / 1000.0);
                return new QuickmapMatch(fName, fName, elevationMeters, slopeDeg, 0.36, albedo, 0.5, summary);
            }

            if ("magnetic-swirl".equals(type)) {
                return new QuickmapMatch(
                        fName, fName, -2140.0, 1.4, 0.14, 0.21, 0.5,
                        fName + " magnetic anomaly swirl across Oceanus Procellarum mare basalt; high optical albedo.");
            }

            double depthKm = asDouble(bestCrater.get("depthKm"), 3.0);
            if (depthKm == 0.0) depthKm = 3.0;
            double rimKm = asDouble(bestCrater.get("rimKm"), 1.2);
            if (rimKm == 0.0) rimKm = 1.2;
            boolean hasPeak = Boolean.TRUE.equals(bestCrater.get("hasPeak"));
            boolean isBright = albedoTag.contains("bright");
            boolean isDarkFloor = albedoTag.contains("low-mare") || albedoTag.contains("dark-floor");

            if (hasPeak && normR <= 0.25) {
                double elevationMeters = Math.round((-depthKm * 0.45 + 1.2) * 1000.0);
                String summary = String.format("%s central peak massif rising inside a %.1f km deep crater basin; steep rocky slopes.",
                        fName, depthKm);
                return new QuickmapMatch(fName, fName + " Central Peak", elevationMeters, 14.2, 0.42,
                        isBright ? 0.18 : 0.15, 4.5, summary);
            }

            if (normR < 0.72) {
                double elevationMeters = Math.round(-depthKm * 1000.0);
                double slopeDeg = round1(3.2 + depthKm * 0.6);
                double horizonDeg = round1(Math.min(18.0,
                        Math.toDegrees(Math.atan2(depthKm + rimKm, Math.max(4.0, radiusKm * (1.0 - normR))))));
                String summary = String.format("%s interior floor (~%.2f km LOLA elevation); surrounded by a %.1f km rim (~%.1f deg horizon mask).",
                        fName, elevationMeters / 1000.0, rimKm, horizonDeg);
                return new QuickmapMatch(fName, fName + " Floor", elevationMeters, slopeDeg,
                        isDarkFloor ? 0.20 : 0.28, isDarkFloor ? 0.09 : (isBright ? 0.17 : 0.14),
                        horizonDeg, summary);
            }

            double rimBase = asDouble(bestCrater.get("rimKm"), 1.3);
            if (rimBase == 0.0) rimBase = 1.3;
            double elevationMeters = Math.round(rimBase * 1000.0 * Math.max(0.25, 1.0 - Math.abs(normR - 0.95)));
            double slopeDeg = round1(11.5 + depthKm * 1.6);
            String summary = String.format("%s terraced rim & upper wall (+%.2f km LOLA elevation); steep %.1f deg wall slope.",
                    fName, elevationMeters / 1000.0, slopeDeg);
            return new QuickmapMatch(fName, fName + " Rim", elevationMeters, slopeDeg, 0.40,
                    isBright ? 0.17 : 0.15, 2.8, summary);
        }

        List<Map<?, ?>> albedoFeatures = asMapList(quickmap.get("notableAlbedoFeatures"));
        Map<?, ?> bestBasin = null;
        double bestBasinRadiusKm = Double.POSITIVE_INFINITY;
        double bestBasinNormR = 0.0;

        for (Map<?, ?> f : albedoFeatures) {
            double fLat = asDouble(f.get("lat"), 0.0);
            double fLon = asDouble(f.get("lon"), 0.0);
            double radiusKm = Math.max(20.0, asDouble(f.get("radiusDeg"), 10.0) * 30.3233);
            double distKm = greatCircleDistanceKm(lat, lon, fLat, fLon);
            if (distKm <= radiusKm * 1.15 && radiusKm < bestBasinRadiusKm) {
                bestBasinRadiusKm = radiusKm;
                bestBasin = f;
                bestBasinNormR = distKm / radiusKm;
            }
        }

        if (bestBasin != null) {
            String fName = asString(bestBasin.get("name"), "Lunar Basin");
            String albedoTag = asString(bestBasin.get("albedo"), "");
            double rimKm = asDouble(bestBasin.get("rimKm"), 0.0);
            boolean isMare = albedoTag.contains("mare");
            if (bestBasinNormR > 0.85 && rimKm >= 1.0) {
                double elevationMeters = Math.round(rimKm * 1000.0);
                String summary = String.format("%s outer topographic basin ring (+%.2f km LOLA rim uplift).",
                        fName, elevationMeters / 1000.0);
                return new QuickmapMatch(fName, fName + " Rim", elevationMeters, round1(7.5 + rimKm * 2.2),
                        0.35, 0.14, 2.0, summary);
            }

            double elevKm = bestBasin.containsKey("elevKm") ? asDouble(bestBasin.get("elevKm"), -2.0) : -2.0;
            double elevationMeters = Math.round(elevKm * 1000.0);
            String summary = isMare
                    ? String.format("%s basaltic mare floor (%.2f km LOLA elevation); low-albedo volcanic plain.",
                            fName, elevationMeters / 1000.0)
                    : String.format("%s deep impact basin interior (%.2f km LOLA elevation).",
                            fName, elevationMeters / 1000.0);
            return new QuickmapMatch(fName, fName, elevationMeters, isMare ? 2.1 : 5.2,
                    isMare ? 0.14 : 0.31, isMare ? 0.08 : 0.13, isMare ? 0.6 : 2.2, summary);
        }

        return null;
    }

    private static List<Double> uniformHorizon(double deg) {
        List<Double> bins = new ArrayList<>(36);
        for (int i = 0; i < 36; i++) bins.add(deg);
        return bins;
    }
}
