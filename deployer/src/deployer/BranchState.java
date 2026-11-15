package deployer;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/** Everything the dashboard knows about one branch. Guarded by its own lock. */
final class BranchState {

    enum Status { QUEUED, BUILDING, RUNNING, PARTLY_RUNNING, NO_SITE, FAILED }

    /** One website (a Java server) found on the branch. */
    static final class App {
        final String mainClass;
        final int port;
        Process process;
        Path logFile;
        String status = "starting"; // starting | running | failed | stopped

        App(String mainClass, int port) {
            this.mainClass = mainClass;
            this.port = port;
        }

        String name() {
            String simple = mainClass.substring(mainClass.lastIndexOf('.') + 1);
            return simple.replace("Server", "");
        }

        /** Where the site is reached through the deployer (works locally and on the public link). */
        String publicPath(String branch) {
            return "/site/" + Builder.enc(branch) + "/" + Builder.enc(name()) + "/";
        }

        String toJson(String branch) {
            return Json.obj("name", Json.q(name()), "mainClass", Json.q(mainClass), "port", Integer.toString(port),
                    "url", Json.q(publicPath(branch)), "localUrl", Json.q("http://localhost:" + port + "/"),
                    "status", Json.q(status));
        }
    }

    final String name;
    final String owner;
    final String role;
    String sha;
    /** The commit that was last built (sha may be newer while a build is waiting). */
    String deployedSha;
    Git.Commit head;
    Status status = Status.QUEUED;
    String message = "Waiting to build";
    final StringBuilder buildLog = new StringBuilder();
    final List<App> apps = new ArrayList<>();
    /** HTML pages on the branch (paths inside the repo). */
    List<String> pages = List.of();
    /** page path -> where to open it (a running site URL, or the deployer's file preview). */
    List<String[]> pageLinks = List.of();
    Path worktree;
    long deployedAt;

    /** How this branch stands against main: main | merged | clean | conflict | unknown. */
    String merge = "unknown";
    int ahead = -1;
    int behind = -1;
    List<String> conflicts = List.of();
    String mergeError;

    BranchState(String name, String owner, String role) {
        this.name = name;
        this.owner = owner;
        this.role = role;
    }

    synchronized void log(String line) {
        buildLog.append(line).append('\n');
        if (buildLog.length() > 200_000) buildLog.delete(0, buildLog.length() - 200_000);
    }

    synchronized String toJson() {
        return Json.obj(
                "name", Json.q(name),
                "owner", Json.q(owner),
                "role", Json.q(role),
                "sha", Json.q(sha),
                "head", head == null ? "null" : head.toJson(),
                "status", Json.q(status.name()),
                "message", Json.q(message),
                "apps", Json.array(apps, a -> a.toJson(name)),
                "pages", Json.array(pageLinks, p -> Json.obj("path", Json.q(p[0]), "url", Json.q(p[1]), "live", Json.b(p[2].equals("live")))),
                "deployedAt", Long.toString(deployedAt),
                "merge", Json.obj("state", Json.q(merge), "ahead", Integer.toString(ahead),
                        "behind", Integer.toString(behind), "conflicts", Json.array(conflicts, Json::q),
                        "error", Json.q(mergeError)));
    }
}
