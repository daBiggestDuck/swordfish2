package deployer;

import java.util.Collection;
import java.util.Locale;
import java.util.function.Function;

/** Tiny JSON writer so the engine needs no libraries. */
final class Json {

    private Json() {}

    /** Quoted, escaped string, or null. */
    public static String q(String s) {
        if (s == null) return "null";
        StringBuilder sb = new StringBuilder("\"");
        for (char c : s.toCharArray()) {
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\r' -> { }
                default -> {
                    if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
                    else sb.append(c);
                }
            }
        }
        return sb.append('"').toString();
    }

    /** Number rounded to 2 decimals. */
    public static String n(double d) {
        return String.format(Locale.ROOT, "%.2f", d);
    }

    public static String b(boolean v) {
        return Boolean.toString(v);
    }

    /** obj("a", "1", "b", q("x")) -> {"a":1,"b":"x"}. Values must already be JSON. */
    public static String obj(String... keysAndValues) {
        StringBuilder sb = new StringBuilder("{");
        for (int i = 0; i < keysAndValues.length; i += 2) {
            if (i > 0) sb.append(',');
            sb.append(q(keysAndValues[i])).append(':').append(keysAndValues[i + 1]);
        }
        return sb.append('}').toString();
    }

    public static <T> String array(Collection<T> items, Function<T, String> toJson) {
        StringBuilder sb = new StringBuilder("[");
        boolean first = true;
        for (T item : items) {
            if (!first) sb.append(',');
            sb.append(toJson.apply(item));
            first = false;
        }
        return sb.append(']').toString();
    }
}
