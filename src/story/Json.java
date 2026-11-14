package story;

import java.util.List;
import java.util.function.Function;

/** Tiny JSON helpers so the server needs no libraries. */
public final class Json {

    private Json() {}

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

    public static <T> String array(List<T> items, Function<T, String> toJson) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < items.size(); i++) {
            if (i > 0) sb.append(',');
            sb.append(toJson.apply(items.get(i)));
        }
        return sb.append(']').toString();
    }
}
