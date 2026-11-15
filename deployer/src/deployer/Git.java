package deployer;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

/** Runs git commands. Never prompts for a password (it uses whatever login is already saved). */
final class Git {

    record Out(int code, byte[] stdout, String stderr) {
        String text() {
            return new String(stdout, StandardCharsets.UTF_8);
        }

        boolean ok() {
            return code == 0;
        }
    }

    private final Path repo;

    Git(Path repo) {
        this.repo = repo;
    }

    Path repo() {
        return repo;
    }

    Out run(String... args) {
        return runIn(repo, 120, args);
    }

    static Out runIn(Path dir, int timeoutSeconds, String... args) {
        List<String> cmd = new ArrayList<>();
        cmd.add("git");
        cmd.addAll(List.of(args));
        ProcessBuilder pb = new ProcessBuilder(cmd).directory(dir.toFile());
        pb.environment().put("GIT_TERMINAL_PROMPT", "0");
        try {
            Process p = pb.start();
            p.getOutputStream().close();
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            ByteArrayOutputStream err = new ByteArrayOutputStream();
            Thread t1 = pump(p.getInputStream(), out);
            Thread t2 = pump(p.getErrorStream(), err);
            if (!p.waitFor(timeoutSeconds, TimeUnit.SECONDS)) {
                p.destroyForcibly();
                return new Out(-1, new byte[0], "git " + String.join(" ", args) + " timed out");
            }
            t1.join();
            t2.join();
            return new Out(p.exitValue(), out.toByteArray(), err.toString(StandardCharsets.UTF_8));
        } catch (IOException e) {
            return new Out(-1, new byte[0], "Could not run git: " + e.getMessage());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return new Out(-1, new byte[0], "interrupted");
        }
    }

    private static Thread pump(InputStream in, ByteArrayOutputStream out) {
        Thread t = new Thread(() -> {
            try (in) {
                in.transferTo(out);
            } catch (IOException ignored) {
                // process ended
            }
        });
        t.setDaemon(true);
        t.start();
        return t;
    }

    /** One commit: sha, short sha, author, unix time, subject. */
    record Commit(String sha, String shortSha, String author, long time, String subject) {
        String toJson() {
            return Json.obj("sha", Json.q(sha), "shortSha", Json.q(shortSha), "author", Json.q(author),
                    "time", Long.toString(time), "subject", Json.q(subject));
        }
    }

    private static final String SEP = "\u001f";
    private static final String COMMIT_FORMAT = "%H" + SEP + "%h" + SEP + "%an" + SEP + "%ct" + SEP + "%s";

    static Commit parseCommit(String line) {
        String[] p = line.split(SEP, 5);
        if (p.length < 5) return null;
        return new Commit(p[0], p[1], p[2], Long.parseLong(p[3].trim()), p[4]);
    }

    /** Branches on GitHub (origin), name -> latest commit. */
    List<String[]> remoteBranches() {
        Out o = run("for-each-ref", "--format=%(refname)" + SEP + "%(objectname)", "refs/remotes/origin/");
        List<String[]> out = new ArrayList<>();
        if (!o.ok()) return out;
        for (String line : o.text().split("\n")) {
            String[] p = line.split(SEP);
            if (p.length != 2) continue;
            String name = p[0].substring("refs/remotes/origin/".length());
            if (name.equals("HEAD")) continue;
            out.add(new String[] {name, p[1]});
        }
        return out;
    }

    List<Commit> log(String sha, int max) {
        Out o = run("log", "-n", Integer.toString(max), "--format=" + COMMIT_FORMAT, sha);
        List<Commit> out = new ArrayList<>();
        if (!o.ok()) return out;
        for (String line : o.text().split("\n")) {
            Commit c = parseCommit(line);
            if (c != null) out.add(c);
        }
        return out;
    }

    List<String> files(String sha) {
        Out o = run("ls-tree", "-r", "--name-only", sha);
        if (!o.ok()) return List.of();
        List<String> out = new ArrayList<>();
        for (String f : o.text().split("\n")) if (!f.isBlank()) out.add(f);
        return out;
    }

    /**
     * Result of trying to merge one commit into another, computed entirely inside git's object store
     * ({@code git merge-tree}): no checkout, no branch is changed. {@code tree} is the merged tree
     * when clean; {@code conflicts} lists the files that would conflict; {@code error} is set when git
     * could not answer (e.g. git older than 2.38).
     */
    record Merge(boolean clean, String tree, List<String> conflicts, String error) {}

    Merge tryMerge(String into, String from) {
        Out o = run("merge-tree", "--write-tree", "--name-only", "--no-messages", into, from);
        String[] lines = o.text().split("\n");
        if (o.code() == 0) return new Merge(true, lines[0].strip(), List.of(), null);
        if (o.code() == 1) {
            List<String> files = new ArrayList<>();
            for (int i = 1; i < lines.length && !lines[i].isBlank(); i++) files.add(lines[i].strip());
            return new Merge(false, null, files, null);
        }
        return new Merge(false, null, List.of(), o.stderr().isBlank() ? "git merge-tree failed" : o.stderr().strip());
    }

    /** Commits {@code sha} has that {@code base} doesn't, and the other way round: {ahead, behind}. */
    int[] aheadBehind(String base, String sha) {
        Out o = run("rev-list", "--left-right", "--count", base + "..." + sha);
        if (!o.ok()) return null;
        String[] p = o.text().strip().split("\\s+");
        if (p.length != 2) return null;
        return new int[] {Integer.parseInt(p[1]), Integer.parseInt(p[0])};
    }

    /** A throwaway merge commit object (never attached to a branch) so later merges can build on it. */
    String mergeCommit(String tree, String parent1, String parent2) {
        Out o = run("commit-tree", tree, "-p", parent1, "-p", parent2, "-m", "deployer: simulated merge");
        return o.ok() ? o.text().strip() : null;
    }

    byte[] show(String sha, String path) {
        Out o = run("show", sha + ":" + path);
        return o.ok() ? o.stdout() : null;
    }
}
