package deployer;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Public link through localhost.run. It uses the "ssh" program that comes with Mac, Linux and
 * Windows 10+, so there is nothing to install and no account. Reconnects if the link drops.
 *
 * The free link changes every time it reconnects; the dashboard always shows the current one.
 */
final class Tunnel {

    private static final Pattern URL = Pattern.compile("https://[a-z0-9-]+\\.lhr\\.life");

    private final int localPort;
    private volatile String url;
    private volatile String error = "Connecting…";
    private volatile Process process;

    Tunnel(int localPort) {
        this.localPort = localPort;
    }

    String url() {
        return url;
    }

    String error() {
        return error;
    }

    void start() {
        Thread t = new Thread(this::run, "public-link");
        t.setDaemon(true);
        t.start();
    }

    private void run() {
        int wait = 5;
        while (true) {
            long started = System.currentTimeMillis();
            try {
                ProcessBuilder pb = new ProcessBuilder("ssh",
                        "-o", "StrictHostKeyChecking=accept-new",
                        "-o", "ServerAliveInterval=30",
                        "-o", "ServerAliveCountMax=3",
                        "-o", "ExitOnForwardFailure=yes",
                        "-R", "80:localhost:" + localPort,
                        "nokey@localhost.run")
                        .redirectErrorStream(true);
                Process p = pb.start();
                process = p;
                p.getOutputStream().close();
                try (BufferedReader r = new BufferedReader(new InputStreamReader(p.getInputStream(), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = r.readLine()) != null) {
                        Matcher m = URL.matcher(line);
                        if (m.find()) {
                            String found = m.group();
                            if (!found.equals(url)) System.out.println("Public link: " + found);
                            url = found;
                            error = null;
                        }
                    }
                }
                p.waitFor();
            } catch (IOException e) {
                error = "Could not start ssh (needed for the public link): " + e.getMessage();
            } catch (InterruptedException e) {
                return;
            }
            url = null;
            if (error == null) error = "Public link dropped. Reconnecting…";
            // Back off if it keeps failing quickly; reset after a long healthy connection.
            wait = System.currentTimeMillis() - started > 120_000 ? 5 : Math.min(60, wait * 2);
            try {
                Thread.sleep(wait * 1000L);
            } catch (InterruptedException e) {
                return;
            }
        }
    }

    void stop() {
        Process p = process;
        if (p != null) p.destroy();
    }

    String toJson(boolean passwordProtected) {
        return Json.obj("enabled", "true", "url", Json.q(url), "error", Json.q(error), "protected", Json.b(passwordProtected));
    }
}
