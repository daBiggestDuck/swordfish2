package data;

/**
 * Tracks the origin of every data value so judges can verify it.
 */
public class Provenance {
    public final String source;
    public final String method;
    public final String url;
    public final String computedDate;

    public Provenance(String source, String method, String url, String computedDate) {
        this.source = source;
        this.method = method;
        this.url = url;
        this.computedDate = computedDate;
    }

    public String toJson() {
        return "{"
            + "\"source\":" + JsonUtil.quote(source) + ","
            + "\"method\":" + JsonUtil.quote(method) + ","
            + "\"url\":" + JsonUtil.quote(url) + ","
            + "\"computedDate\":" + JsonUtil.quote(computedDate)
            + "}";
    }
}
