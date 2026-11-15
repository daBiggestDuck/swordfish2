package data;

import java.util.List;

/**
 * Minimal JSON helpers — no external dependencies.
 */
public final class JsonUtil {

    private JsonUtil() {}

    public static String quote(String s) {
        if (s == null) return "null";
        StringBuilder sb = new StringBuilder("\"");
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"':  sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n");  break;
                case '\r': sb.append("\\r");  break;
                case '\t': sb.append("\\t");  break;
                default:   sb.append(c);
            }
        }
        sb.append("\"");
        return sb.toString();
    }

    public static String array(List<String> jsonElements) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < jsonElements.size(); i++) {
            if (i > 0) sb.append(",");
            sb.append(jsonElements.get(i));
        }
        sb.append("]");
        return sb.toString();
    }

    public static String stringArray(List<String> values) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < values.size(); i++) {
            if (i > 0) sb.append(",");
            sb.append(quote(values.get(i)));
        }
        sb.append("]");
        return sb.toString();
    }

    public static String fmt(double v, int decimals) {
        return String.format("%." + decimals + "f", v);
    }
}
