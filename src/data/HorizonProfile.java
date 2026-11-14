package data;

/**
 * Computes a terrain horizon profile by ray-marching a DEM grid
 * outward from a site in 180 azimuth directions.
 *
 * The profile stores the maximum elevation angle (degrees) that
 * terrain reaches in each 2° azimuth bin, as seen from the site.
 *
 * Usage:
 *   float[][] dem = MoonTrekClient.parseDemTiff(bytes, w, h);
 *   double dx = patchWidthMetres / w;
 *   double[] profile = HorizonProfile.compute(dem, dx);
 *
 * The result is consumed by SkyMath.terrainAdjustedMargin() and
 * SkyMath.illuminationFraction().
 */
public final class HorizonProfile {

    private HorizonProfile() {}

    /** Number of azimuth bins (2° each → 360°). */
    public static final int N_BINS = 180;

    /**
     * Compute the horizon profile from a DEM grid.
     *
     * @param dem    elevation grid [rows][cols] in metres
     * @param dx     grid spacing in metres (assumed square pixels)
     * @return       180-element array of horizon elevation angles (degrees)
     */
    public static double[] compute(float[][] dem, double dx) {
        int H = dem.length;
        int W = dem[0].length;
        int cy = H / 2;
        int cx = W / 2;
        double h0 = dem[cy][cx];

        // Apply a 3×3 median filter to suppress single-pixel spikes
        // (Moon Trek bilinear helps, but edges can still spike)
        float[][] filtered = medianFilter3(dem);

        double[] horizon = new double[N_BINS];
        int maxR = Math.min(W, H) / 2 - 2;

        for (int k = 0; k < N_BINS; k++) {
            double az = 2.0 * Math.PI * k / N_BINS;
            double ux = Math.sin(az);
            double uy = -Math.cos(az);  // north = -y in image coords

            double best = -90.0;
            for (int r = 2; r < maxR; r++) {
                int x = (int) (cx + ux * r);
                int y = (int) (cy + uy * r);
                if (x < 0 || y < 0 || x >= W || y >= H) break;

                double dist = r * dx;
                double angle = Math.toDegrees(Math.atan2(filtered[y][x] - h0, dist));
                if (angle > best) best = angle;
            }
            horizon[k] = best;
        }

        return horizon;
    }

    /**
     * Summary statistics for display.
     */
    public static double max(double[] profile) {
        double m = profile[0];
        for (double v : profile) if (v > m) m = v;
        return m;
    }

    public static double mean(double[] profile) {
        double s = 0;
        for (double v : profile) s += v;
        return s / profile.length;
    }

    /**
     * Serialize to JSON array string.
     */
    public static String toJson(double[] profile) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < profile.length; i++) {
            if (i > 0) sb.append(",");
            sb.append(JsonUtil.fmt(profile[i], 2));
        }
        sb.append("]");
        return sb.toString();
    }

    // ── 3×3 median filter ──────────────────────────────────────

    private static float[][] medianFilter3(float[][] src) {
        int H = src.length, W = src[0].length;
        float[][] out = new float[H][W];
        // Copy edges unchanged
        for (int r = 0; r < H; r++) {
            out[r][0] = src[r][0];
            out[r][W-1] = src[r][W-1];
        }
        for (int c = 0; c < W; c++) {
            out[0][c] = src[0][c];
            out[H-1][c] = src[H-1][c];
        }
        // Interior
        float[] window = new float[9];
        for (int r = 1; r < H - 1; r++) {
            for (int c = 1; c < W - 1; c++) {
                int idx = 0;
                for (int dr = -1; dr <= 1; dr++)
                    for (int dc = -1; dc <= 1; dc++)
                        window[idx++] = src[r+dr][c+dc];
                out[r][c] = median9(window);
            }
        }
        return out;
    }

    private static float median9(float[] a) {
        // Simple insertion sort for 9 elements
        for (int i = 1; i < 9; i++) {
            float key = a[i];
            int j = i - 1;
            while (j >= 0 && a[j] > key) { a[j+1] = a[j]; j--; }
            a[j+1] = key;
        }
        return a[4];
    }
}
