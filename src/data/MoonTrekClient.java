package data;

import java.io.*;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;

/**
 * Fetches LOLA DEM elevation patches and WAC basemap imagery
 * from NASA Moon Trek ArcGIS ImageServer REST endpoints.
 *
 * All requests use exportImage with bbox in EPSG:4326.
 * No API key required.
 *
 * Services confirmed working 2026-11-14:
 *   LRO_LOLA_DEM_Global_256ppd_v06    (global, ~118 m/px)
 *   LRO_LOLA_DEM_SPole45_100mp_v04    (south pole, 100 m/px)
 *   LRO_WAC_Mosaic_Global_303ppd_v02  (basemap imagery)
 */
public class MoonTrekClient {

    private static final String BASE = "https://trek.nasa.gov/moon/trekarcgis/rest/services/";

    public static final String DEM_GLOBAL    = "LRO_LOLA_DEM_Global_256ppd_v06/ImageServer";
    public static final String DEM_SPOLE    = "LRO_LOLA_DEM_SPole45_100mp_v04/ImageServer";
    public static final String DEM_SPOLE_HR = "ldem_85s_10m_Spole_float/ImageServer"; // 10 m, geographic, ≥83°S
    public static final String WAC_GLOBAL   = "LRO_WAC_Mosaic_Global_303ppd_v02/ImageServer";

    /**
     * Export a DEM patch as raw float32 TIFF bytes.
     * Returns the raw response bytes (a TIFF image with F32 pixel type).
     *
     * @param service   one of the *_GLOBAL / *_SPOLE constants
     * @param lonMin    west  (deg)
     * @param latMin    south (deg)
     * @param lonMax    east  (deg)
     * @param latMax    north (deg)
     * @param width     pixel width
     * @param height    pixel height
     */
    public static byte[] fetchDemTiff(String service,
                                       double lonMin, double latMin,
                                       double lonMax, double latMax,
                                       int width, int height)
            throws IOException {
        String bbox = lonMin + "," + latMin + "," + lonMax + "," + latMax;
        String url = BASE + service + "/exportImage"
            + "?bbox=" + bbox
            + "&bboxSR=4326&imageSR=4326"
            + "&size=" + width + "," + height
            + "&format=tiff&pixelType=F32"
            + "&interpolation=RSP_BilinearInterpolation"
            + "&f=image";
        System.out.println("[MoonTrek] Fetching DEM: " + service + " bbox=" + bbox);
        return httpGet(url);
    }

    /**
     * Export a WAC basemap patch as PNG bytes.
     */
    public static byte[] fetchWacPng(double lonMin, double latMin,
                                      double lonMax, double latMax,
                                      int width, int height)
            throws IOException {
        String bbox = lonMin + "," + latMin + "," + lonMax + "," + latMax;
        String url = BASE + WAC_GLOBAL + "/exportImage"
            + "?bbox=" + bbox
            + "&bboxSR=4326&imageSR=4326"
            + "&size=" + width + "," + height
            + "&format=png"
            + "&f=image";
        System.out.println("[MoonTrek] Fetching WAC: bbox=" + bbox);
        return httpGet(url);
    }

    /**
     * Fetch the CLPS landing sites GeoJSON from Moon Trek.
     */
    public static String fetchClpsSitesJson() throws IOException {
        String url = "https://trek.nasa.gov/moon/trekarcgis3/rest/services/"
            + "CLPS_sites/MapServer/0/query"
            + "?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&f=json";
        System.out.println("[MoonTrek] Fetching CLPS sites...");
        byte[] data = httpGet(url);
        return new String(data, "UTF-8");
    }

    /**
     * Fetch PSR polygon count from the south pole.
     */
    public static String fetchPsrJson() throws IOException {
        String url = "https://trek.nasa.gov/moon/trekarcgis/rest/services/"
            + "PSR_SP/MapServer/0/query"
            + "?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&f=json";
        System.out.println("[MoonTrek] Fetching PSR polygons...");
        byte[] data = httpGet(url);
        return new String(data, "UTF-8");
    }

    /**
     * Parse a float32 TIFF into a 2D elevation array.
     * Minimal TIFF parser — handles the uncompressed F32 format
     * returned by Moon Trek's exportImage.
     */
    public static float[][] parseDemTiff(byte[] tiffBytes, int expectedW, int expectedH) {
        ByteBuffer buf = ByteBuffer.wrap(tiffBytes);

        // Byte order
        byte b0 = buf.get(0);
        if (b0 == 'I') buf.order(ByteOrder.LITTLE_ENDIAN);
        else buf.order(ByteOrder.BIG_ENDIAN);

        // IFD offset
        int ifdOff = buf.getInt(4);

        // Parse IFD entries
        int nEntries = buf.getShort(ifdOff) & 0xFFFF;
        int width = 0, height = 0;
        int rowsPerStrip = 0;
        int[] stripOffsets = null;
        int[] stripByteCounts = null;

        for (int i = 0; i < nEntries; i++) {
            int pos = ifdOff + 2 + i * 12;
            int tag = buf.getShort(pos) & 0xFFFF;
            int type = buf.getShort(pos + 2) & 0xFFFF;
            int count = buf.getInt(pos + 4);
            int valOff = pos + 8;

            switch (tag) {
                case 256: // ImageWidth
                    width = readValue(buf, type, valOff);
                    break;
                case 257: // ImageLength
                    height = readValue(buf, type, valOff);
                    break;
                case 273: // StripOffsets
                    if (count == 1) {
                        stripOffsets = new int[]{ readValue(buf, type, valOff) };
                    } else {
                        int ptr = buf.getInt(valOff);
                        stripOffsets = new int[count];
                        for (int j = 0; j < count; j++)
                            stripOffsets[j] = readValue(buf, type, ptr + j * typeSize(type));
                    }
                    break;
                case 278: // RowsPerStrip
                    rowsPerStrip = readValue(buf, type, valOff);
                    break;
                case 279: // StripByteCounts
                    if (count == 1) {
                        stripByteCounts = new int[]{ readValue(buf, type, valOff) };
                    } else {
                        int ptr = buf.getInt(valOff);
                        stripByteCounts = new int[count];
                        for (int j = 0; j < count; j++)
                            stripByteCounts[j] = readValue(buf, type, ptr + j * typeSize(type));
                    }
                    break;
            }
        }

        if (width == 0 || height == 0) {
            throw new RuntimeException("Could not parse TIFF dimensions: w=" + width + " h=" + height);
        }

        float[][] grid = new float[height][width];

        if (stripOffsets != null) {
            // Multi-strip or single-strip
            int row = 0;
            for (int s = 0; s < stripOffsets.length && row < height; s++) {
                int off = stripOffsets[s];
                int rps = (rowsPerStrip > 0) ? Math.min(rowsPerStrip, height - row) : height;
                for (int r = 0; r < rps && row < height; r++, row++) {
                    for (int c = 0; c < width; c++) {
                        grid[row][c] = buf.getFloat(off + (r * width + c) * 4);
                    }
                }
            }
        } else {
            // Fallback: data starts right after the IFD
            int dataStart = ifdOff + 2 + nEntries * 12 + 4;
            for (int r = 0; r < height; r++) {
                for (int c = 0; c < width; c++) {
                    grid[r][c] = buf.getFloat(dataStart + (r * width + c) * 4);
                }
            }
        }

        return grid;
    }

    private static int readValue(ByteBuffer buf, int type, int off) {
        switch (type) {
            case 3: return buf.getShort(off) & 0xFFFF; // SHORT
            case 4: return buf.getInt(off);             // LONG
            default: return buf.getInt(off);
        }
    }

    private static int typeSize(int type) {
        switch (type) {
            case 3: return 2; // SHORT
            case 4: return 4; // LONG
            default: return 4;
        }
    }

    private static byte[] httpGet(String urlStr) throws IOException {
        HttpURLConnection conn = (HttpURLConnection) URI.create(urlStr).toURL().openConnection();
        conn.setConnectTimeout(30_000);
        conn.setReadTimeout(180_000);
        conn.setRequestProperty("User-Agent", "LunarPets-DataPipeline/1.0");

        int code = conn.getResponseCode();
        if (code != 200) {
            throw new IOException("HTTP " + code + " from " + urlStr);
        }

        InputStream in = conn.getInputStream();
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        byte[] tmp = new byte[8192];
        int n;
        while ((n = in.read(tmp)) != -1) bos.write(tmp, 0, n);
        in.close();
        return bos.toByteArray();
    }
}
