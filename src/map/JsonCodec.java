package map;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Lightweight zero-dependency JSON parser and serializer for JDK 17+.
 * Supports reading raw NASA API payloads (Moon Trek ArcGIS REST, JPL Horizons, LROC QuickMap)
 * and serializing Map API responses without external libraries.
 */
public final class JsonCodec {

    private final String src;
    private int pos;

    private JsonCodec(String src) {
        this.src = src;
        this.pos = 0;
    }

    public static Object parse(String json) {
        if (json == null) throw new IllegalArgumentException("JSON input is null");
        JsonCodec parser = new JsonCodec(json);
        Object val = parser.readValue();
        parser.skipWhitespace();
        if (parser.pos < parser.src.length()) {
            throw new IllegalArgumentException("Unexpected trailing JSON content at index " + parser.pos);
        }
        return val;
    }

    @SuppressWarnings("unchecked")
    public static Map<String, Object> parseObject(String json) {
        Object parsed = parse(json);
        if (!(parsed instanceof Map<?, ?>)) {
            throw new IllegalArgumentException("Expected JSON object at root");
        }
        return (Map<String, Object>) parsed;
    }

    private void skipWhitespace() {
        while (pos < src.length()) {
            char c = src.charAt(pos);
            if (c == ' ' || c == '\t' || c == '\n' || c == '\r') pos++;
            else break;
        }
    }

    private Object readValue() {
        skipWhitespace();
        if (pos >= src.length()) throw new IllegalArgumentException("Unexpected end of JSON");
        char c = src.charAt(pos);
        return switch (c) {
            case '{' -> readObject();
            case '[' -> readArray();
            case '"' -> readString();
            case 't', 'f' -> readBoolean();
            case 'n' -> readNull();
            default -> readNumber();
        };
    }

    private Map<String, Object> readObject() {
        pos++; // '{'
        Map<String, Object> map = new LinkedHashMap<>();
        skipWhitespace();
        if (pos < src.length() && src.charAt(pos) == '}') {
            pos++;
            return map;
        }
        while (pos < src.length()) {
            skipWhitespace();
            if (src.charAt(pos) != '"') throw new IllegalArgumentException("Expected string key at " + pos);
            String key = readString();
            skipWhitespace();
            if (pos >= src.length() || src.charAt(pos) != ':') {
                throw new IllegalArgumentException("Expected ':' at " + pos);
            }
            pos++;
            Object val = readValue();
            map.put(key, val);
            skipWhitespace();
            if (pos >= src.length()) throw new IllegalArgumentException("Unterminated JSON object");
            char next = src.charAt(pos++);
            if (next == '}') return map;
            if (next != ',') throw new IllegalArgumentException("Expected ',' or '}' at " + (pos - 1));
        }
        throw new IllegalArgumentException("Unterminated JSON object");
    }

    private List<Object> readArray() {
        pos++; // '['
        List<Object> list = new ArrayList<>();
        skipWhitespace();
        if (pos < src.length() && src.charAt(pos) == ']') {
            pos++;
            return list;
        }
        while (pos < src.length()) {
            list.add(readValue());
            skipWhitespace();
            if (pos >= src.length()) throw new IllegalArgumentException("Unterminated JSON array");
            char next = src.charAt(pos++);
            if (next == ']') return list;
            if (next != ',') throw new IllegalArgumentException("Expected ',' or ']' at " + (pos - 1));
        }
        throw new IllegalArgumentException("Unterminated JSON array");
    }

    private String readString() {
        pos++; // '"'
        StringBuilder sb = new StringBuilder();
        while (pos < src.length()) {
            char c = src.charAt(pos++);
            if (c == '"') return sb.toString();
            if (c == '\\') {
                if (pos >= src.length()) throw new IllegalArgumentException("Invalid escape at end of JSON");
                char esc = src.charAt(pos++);
                switch (esc) {
                    case '"', '\\', '/' -> sb.append(esc);
                    case 'b' -> sb.append('\b');
                    case 'f' -> sb.append('\f');
                    case 'n' -> sb.append('\n');
                    case 'r' -> sb.append('\r');
                    case 't' -> sb.append('\t');
                    case 'u' -> {
                        if (pos + 4 > src.length()) throw new IllegalArgumentException("Invalid unicode escape");
                        sb.append((char) Integer.parseInt(src.substring(pos, pos + 4), 16));
                        pos += 4;
                    }
                    default -> throw new IllegalArgumentException("Unknown escape \\" + esc);
                }
            } else {
                sb.append(c);
            }
        }
        throw new IllegalArgumentException("Unterminated JSON string");
    }

    private Boolean readBoolean() {
        if (src.startsWith("true", pos)) {
            pos += 4;
            return Boolean.TRUE;
        }
        if (src.startsWith("false", pos)) {
            pos += 5;
            return Boolean.FALSE;
        }
        throw new IllegalArgumentException("Invalid boolean at " + pos);
    }

    private Object readNull() {
        if (src.startsWith("null", pos)) {
            pos += 4;
            return null;
        }
        throw new IllegalArgumentException("Invalid null at " + pos);
    }

    private Number readNumber() {
        int start = pos;
        if (src.charAt(pos) == '-') pos++;
        boolean isFloat = false;
        while (pos < src.length()) {
            char c = src.charAt(pos);
            if (c >= '0' && c <= '9') {
                pos++;
            } else if (c == '.' || c == 'e' || c == 'E' || c == '+' || c == '-') {
                if (c == '-' || c == '+') {
                    char prev = pos > start ? src.charAt(pos - 1) : '\0';
                    if (prev != 'e' && prev != 'E') break;
                }
                isFloat = true;
                pos++;
            } else {
                break;
            }
        }
        String raw = src.substring(start, pos);
        if (raw.isEmpty() || raw.equals("-")) {
            throw new IllegalArgumentException("Invalid number at " + start);
        }
        if (isFloat) return Double.parseDouble(raw);
        long l = Long.parseLong(raw);
        if (l >= Integer.MIN_VALUE && l <= Integer.MAX_VALUE) return (int) l;
        return l;
    }

    public static String q(String s) {
        if (s == null) return "null";
        StringBuilder sb = new StringBuilder("\"");
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\b' -> sb.append("\\b");
                case '\f' -> sb.append("\\f");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> {
                    if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
                    else sb.append(c);
                }
            }
        }
        return sb.append('"').toString();
    }

    @SuppressWarnings("unchecked")
    public static String stringify(Object value) {
        if (value == null) return "null";
        if (value instanceof String s) return q(s);
        if (value instanceof Number || value instanceof Boolean) return value.toString();
        if (value instanceof Map<?, ?> m) {
            StringBuilder sb = new StringBuilder("{");
            boolean first = true;
            for (Map.Entry<?, ?> e : m.entrySet()) {
                if (!first) sb.append(',');
                first = false;
                sb.append(q(String.valueOf(e.getKey()))).append(':').append(stringify(e.getValue()));
            }
            return sb.append('}').toString();
        }
        if (value instanceof List<?> list) {
            StringBuilder sb = new StringBuilder("[");
            for (int i = 0; i < list.size(); i++) {
                if (i > 0) sb.append(',');
                sb.append(stringify(list.get(i)));
            }
            return sb.append(']').toString();
        }
        return q(String.valueOf(value));
    }
}
