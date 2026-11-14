package data;

import java.io.*;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.List;

/**
 * Fetches sub-solar and sub-Earth selenographic coordinates from
 * JPL Horizons API and parses the CSV result.
 *
 * Endpoint: https://ssd.jpl.nasa.gov/api/horizons.api
 * Body 301 (Moon), center 500@399 (geocentric Earth), QUANTITIES='14,15'
 *   col 14 = ObsSub-LON, ObsSub-LAT  (sub-Earth point on Moon)
 *   col 15 = SunSub-LON, SunSub-LAT  (sub-solar point on Moon)
 *
 * CSV_FORMAT=YES produces comma-separated rows between $$SOE and $$EOE.
 *
 * No API key needed. No CORS → this is a build-time fetch only.
 * The output is baked to data/ephemeris.json for the frontend.
 */
public class EphemerisClient {

    /** One row of parsed ephemeris data. */
    public static class Row {
        public final String dateTime;    // "2024-Jan-01 00:00"
        public final double subEarthLon; // deg
        public final double subEarthLat; // deg
        public final double subSolarLon; // deg
        public final double subSolarLat; // deg

        public Row(String dateTime, double subEarthLon, double subEarthLat,
                   double subSolarLon, double subSolarLat) {
            this.dateTime = dateTime;
            this.subEarthLon = subEarthLon;
            this.subEarthLat = subEarthLat;
            this.subSolarLon = subSolarLon;
            this.subSolarLat = subSolarLat;
        }

        public String toJson() {
            return "{"
                + "\"t\":" + JsonUtil.quote(dateTime) + ","
                + "\"elo\":" + JsonUtil.fmt(subEarthLon, 4) + ","
                + "\"ela\":" + JsonUtil.fmt(subEarthLat, 4) + ","
                + "\"slo\":" + JsonUtil.fmt(subSolarLon, 4) + ","
                + "\"sla\":" + JsonUtil.fmt(subSolarLat, 4)
                + "}";
        }
    }

    /**
     * Fetch ephemeris from Horizons for a date range.
     *
     * @param startDate  e.g. "2024-01-01"
     * @param stopDate   e.g. "2029-01-01"
     * @param stepSize   e.g. "3h" for 3-hour intervals
     * @return parsed rows
     */
    public static List<Row> fetch(String startDate, String stopDate, String stepSize)
            throws IOException {
        String params = "format=text"
            + "&COMMAND=%27301%27"
            + "&EPHEM_TYPE=OBSERVER"
            + "&CENTER=%27500%40399%27"
            + "&START_TIME=%27" + urlEnc(startDate) + "%27"
            + "&STOP_TIME=%27"  + urlEnc(stopDate)  + "%27"
            + "&STEP_SIZE=%27"  + urlEnc(stepSize)  + "%27"
            + "&QUANTITIES=%2714%2C15%27"
            + "&OBJ_DATA=NO"
            + "&CSV_FORMAT=YES";

        String urlStr = "https://ssd.jpl.nasa.gov/api/horizons.api?" + params;
        System.out.println("[EphemerisClient] Fetching: " + startDate + " → " + stopDate
                           + " step=" + stepSize);

        HttpURLConnection conn = (HttpURLConnection) URI.create(urlStr).toURL().openConnection();
        conn.setConnectTimeout(30_000);
        conn.setReadTimeout(120_000);
        conn.setRequestProperty("User-Agent", "LunarPets-DataPipeline/1.0");

        int code = conn.getResponseCode();
        if (code != 200) {
            throw new IOException("Horizons returned HTTP " + code);
        }

        BufferedReader rd = new BufferedReader(new InputStreamReader(conn.getInputStream()));
        List<Row> rows = new ArrayList<>();
        boolean inData = false;
        String line;
        while ((line = rd.readLine()) != null) {
            if (line.startsWith("$$SOE")) { inData = true; continue; }
            if (line.startsWith("$$EOE")) break;
            if (!inData) continue;

            // CSV row: " 2024-Jan-01 00:00, , , 358.716549,  -6.556142,   32.519634,  -1.346422,"
            String[] parts = line.split(",");
            if (parts.length < 7) continue;
            try {
                String dt = parts[0].trim();
                double eLon = Double.parseDouble(parts[3].trim());
                double eLat = Double.parseDouble(parts[4].trim());
                double sLon = Double.parseDouble(parts[5].trim());
                double sLat = Double.parseDouble(parts[6].trim());
                rows.add(new Row(dt, eLon, eLat, sLon, sLat));
            } catch (NumberFormatException e) {
                // skip malformed rows
            }
        }
        rd.close();
        System.out.println("[EphemerisClient] Parsed " + rows.size() + " rows.");
        return rows;
    }

    /**
     * Extract arrays for batch computation.
     */
    public static double[] subSolarLon(List<Row> rows) {
        double[] a = new double[rows.size()];
        for (int i = 0; i < rows.size(); i++) a[i] = rows.get(i).subSolarLon;
        return a;
    }
    public static double[] subSolarLat(List<Row> rows) {
        double[] a = new double[rows.size()];
        for (int i = 0; i < rows.size(); i++) a[i] = rows.get(i).subSolarLat;
        return a;
    }
    public static double[] subEarthLon(List<Row> rows) {
        double[] a = new double[rows.size()];
        for (int i = 0; i < rows.size(); i++) a[i] = rows.get(i).subEarthLon;
        return a;
    }
    public static double[] subEarthLat(List<Row> rows) {
        double[] a = new double[rows.size()];
        for (int i = 0; i < rows.size(); i++) a[i] = rows.get(i).subEarthLat;
        return a;
    }

    private static String urlEnc(String s) {
        try { return URLEncoder.encode(s, "UTF-8"); }
        catch (UnsupportedEncodingException e) { return s; }
    }
}
