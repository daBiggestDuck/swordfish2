package deployer;

import java.io.IOException;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Properties;
import java.util.Set;

/**
 * Payload Pets deployer: one dashboard that shows every branch on GitHub, its code and its running website.
 *
 * Every 30 s it fetches from GitHub. When a branch has a new commit, it rebuilds and restarts that
 * branch's site(s). Push to your branch and your change shows up here by itself.
 *
 *   ./deploy.sh                 dashboard at http://localhost:8000
 *   ./deploy.sh --port 9000     different dashboard port
 *   ./deploy.sh --interval 10   check GitHub every 10 s
 *   ./deploy.sh --offline       don't fetch; use the branches already downloaded
 *   ./deploy.sh --public        also make a public link anyone can open (asks for the team password)
 *   ./deploy.sh --password X    require password X (the --public default is a saved random one)
 *   ./deploy.sh --public --no-password   public link with no password: anyone with the link sees everything
 */
public final class Deployer {

    private final Git git;
    private final Builder builder;
    private final Map<String, BranchState> branches = new LinkedHashMap<>();
    private final Map<String, String[]> team;
    private final List<String> teamOrder;
    private final boolean offline;
    final int intervalSeconds;

    private volatile boolean fetchOk = true;
    private volatile String fetchError = null;
    private volatile long lastFetch = 0;
    private volatile String activity = "Starting";
    /** JSON: what happens if every team branch is merged into main, one after another. */
    private volatile String together = "null";
    private Tunnel tunnel;
    private boolean passwordProtected;
    private final Object wake = new Object();
    private boolean refreshRequested = false;

    private Deployer(Git git, Builder builder, Map<String, String[]> team, boolean offline, int intervalSeconds) {
        this.git = git;
        this.builder = builder;
        this.team = team;
        this.teamOrder = new ArrayList<>(team.keySet());
        this.offline = offline;
        this.intervalSeconds = intervalSeconds;
    }

    public static void main(String[] args) throws Exception {
        int port = 8000;
        int appPort = 8100;
        int interval = 30;
        boolean offline = false;
        boolean makePublic = false;
        boolean noPassword = false;
        String password = null;
        for (int i = 0; i < args.length; i++) {
            switch (args[i]) {
                case "--port" -> port = Integer.parseInt(args[++i]);
                case "--apps-from" -> appPort = Integer.parseInt(args[++i]);
                case "--interval" -> interval = Math.max(5, Integer.parseInt(args[++i]));
                case "--offline" -> offline = true;
                case "--public" -> makePublic = true;
                case "--password" -> password = args[++i];
                case "--no-password" -> noPassword = true;
                default -> {
                    System.err.println("Unknown option: " + args[i]);
                    System.exit(2);
                }
            }
        }

        Git.Out top = Git.runIn(Path.of("").toAbsolutePath(), 10, "rev-parse", "--show-toplevel");
        if (!top.ok()) {
            System.err.println("Run this from inside the swordfish2 git folder.");
            System.exit(1);
        }
        Path repo = Path.of(top.text().strip());
        Git git = new Git(repo);
        Path workRoot = Path.of(System.getProperty("java.io.tmpdir"), "payload-pets-deployer",
                Integer.toHexString(repo.toString().hashCode()));

        Builder builder = new Builder(git, workRoot, appPort);
        builder.cleanWorkRoot();
        Deployer d = new Deployer(git, builder, loadTeam(repo), offline, interval);
        if (password == null && makePublic && !noPassword) password = savedPassword(repo);
        if (noPassword) password = null;
        d.passwordProtected = password != null;
        Runtime.getRuntime().addShutdownHook(new Thread(d::stopAll));
        Dashboard.start(d, port, password);
        System.out.println("Payload Pets deployer: http://localhost:" + port + "/  (Ctrl+C to stop)");
        if (password != null) System.out.println("Team password: " + password + "  (any username works)");
        if (makePublic) {
            d.tunnel = new Tunnel(port);
            d.tunnel.start();
            System.out.println("Opening a public link through localhost.run…");
            if (password == null) System.out.println("WARNING: no password. Anyone with the link can see all branches and code.");
        }
        System.out.println("Branch sites will use ports " + appPort + " and up. Builds go in " + workRoot);
        d.loop();
    }

    /** A random team password, saved inside .git so it stays the same between runs (never committed). */
    static String savedPassword(Path repo) throws IOException {
        Git.Out gd = Git.runIn(repo, 10, "rev-parse", "--git-common-dir");
        Path gitDir = repo.resolve(gd.text().strip());
        Path f = gitDir.resolve("deployer-password");
        if (Files.exists(f)) {
            String saved = Files.readString(f, StandardCharsets.UTF_8).strip();
            if (!saved.isEmpty()) return saved;
        }
        String alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
        java.security.SecureRandom r = new java.security.SecureRandom();
        StringBuilder sb = new StringBuilder("moon-");
        for (int i = 0; i < 8; i++) sb.append(alphabet.charAt(r.nextInt(alphabet.length())));
        Files.writeString(f, sb + "\n", StandardCharsets.UTF_8);
        return sb.toString();
    }

    /** branches.properties: branch = owner | role. Keys are lower case. */
    static Map<String, String[]> loadTeam(Path repo) {
        Map<String, String[]> out = new LinkedHashMap<>();
        Path f = repo.resolve("deployer/branches.properties");
        if (!Files.exists(f)) return out;
        List<String> keys = new ArrayList<>();
        try {
            for (String line : Files.readAllLines(f, StandardCharsets.UTF_8)) {
                String t = line.strip();
                if (t.isEmpty() || t.startsWith("#") || !t.contains("=")) continue;
                keys.add(t.substring(0, t.indexOf('=')).strip().toLowerCase(Locale.ROOT));
            }
            Properties p = new Properties();
            try (Reader r = Files.newBufferedReader(f, StandardCharsets.UTF_8)) {
                p.load(r);
            }
            for (String k : keys) {
                String v = p.getProperty(k, "");
                String[] parts = v.split("\\|", 2);
                out.put(k, new String[] {parts[0].strip(), parts.length > 1 ? parts[1].strip() : ""});
            }
        } catch (IOException e) {
            System.err.println("Could not read " + f + ": " + e.getMessage());
        }
        return out;
    }

    // ------------------------------------------------------------------ main loop

    private void loop() {
        while (true) {
            try {
                cycle();
            } catch (RuntimeException e) {
                activity = "Error: " + e.getMessage();
                e.printStackTrace();
            }
            synchronized (wake) {
                if (!refreshRequested) {
                    try {
                        wake.wait(intervalSeconds * 1000L);
                    } catch (InterruptedException e) {
                        return;
                    }
                }
                refreshRequested = false;
            }
        }
    }

    void requestRefresh() {
        synchronized (wake) {
            refreshRequested = true;
            wake.notifyAll();
        }
    }

    private void cycle() {
        if (!offline) {
            activity = "Checking GitHub for changes";
            Git.Out o = git.run("fetch", "origin", "--prune");
            fetchOk = o.ok();
            fetchError = o.ok() ? null : o.stderr().strip();
            lastFetch = System.currentTimeMillis();
        }

        List<String[]> remote = git.remoteBranches();
        Set<String> seen = new HashSet<>();
        for (String[] b : remote) seen.add(b[0]);

        // Branches deleted on GitHub: stop their sites.
        List<BranchState> gone;
        synchronized (branches) {
            gone = branches.values().stream().filter(s -> !seen.contains(s.name)).toList();
            gone.forEach(s -> branches.remove(s.name));
        }
        for (BranchState s : gone) builder.remove(s);

        // New or changed branches: (re)build. Order: main first, then team order.
        remote.sort(Comparator.comparingInt(b -> order(b[0])));
        for (String[] b : remote) {
            String name = b[0], sha = b[1];
            BranchState st;
            synchronized (branches) {
                st = branches.computeIfAbsent(name, n -> {
                    String[] t = team.getOrDefault(n.toLowerCase(Locale.ROOT), new String[] {"", ""});
                    return new BranchState(n, t[0], t[1]);
                });
            }
            if (sha.equals(st.sha)) continue;
            List<Git.Commit> head = git.log(sha, 1);
            synchronized (st) {
                st.sha = sha;
                st.head = head.isEmpty() ? null : head.get(0);
            }
        }
        checkMerges(remote);
        for (BranchState st : snapshot()) {
            if (st.sha.equals(deployedSha(st))) continue;
            activity = "Building " + st.name;
            builder.deploy(st, st.sha);
            synchronized (st) {
                st.deployedSha = st.sha;
            }
        }
        for (BranchState st : snapshot()) builder.checkHealth(st);
        activity = "Up to date";
    }

    /**
     * For every branch: how far it is from main and whether it merges cleanly. Then a dry run of
     * merging all team branches into main in team order, to catch branches that clash with each
     * other. Runs inside git's object store only: no branch, checkout or remote is changed.
     */
    private void checkMerges(List<String[]> remote) {
        String mainSha = null;
        for (String[] b : remote) if (b[0].equals("main")) mainSha = b[1];
        if (mainSha == null) {
            together = Json.obj("ok", "false", "error", Json.q("There is no main branch on GitHub."));
            return;
        }
        for (BranchState st : snapshot()) {
            String sha;
            synchronized (st) {
                sha = st.sha;
            }
            String state;
            int[] ab = st.name.equals("main") ? new int[] {0, 0} : git.aheadBehind(mainSha, sha);
            List<String> conflicts = List.of();
            String error = null;
            if (st.name.equals("main")) state = "main";
            else if (ab == null) { state = "unknown"; error = "git could not compare this branch with main"; }
            else if (ab[0] == 0) state = "merged";
            else {
                Git.Merge m = git.tryMerge(mainSha, sha);
                state = m.error() != null ? "unknown" : m.clean() ? "clean" : "conflict";
                conflicts = m.conflicts();
                error = m.error();
            }
            synchronized (st) {
                st.merge = state;
                st.ahead = ab == null ? -1 : ab[0];
                st.behind = ab == null ? -1 : ab[1];
                st.conflicts = conflicts;
                st.mergeError = error;
            }
        }

        // Dry run: main + team branches in the order of branches.properties.
        String tip = mainSha;
        List<String> steps = new ArrayList<>();
        String stoppedAt = null, error = null;
        List<String> files = List.of();
        for (String key : teamOrder) {
            if (key.equals("main")) continue;
            BranchState st = null;
            for (BranchState s : snapshot()) if (s.name.equalsIgnoreCase(key)) st = s;
            if (st == null) continue;
            String sha;
            synchronized (st) {
                sha = st.sha;
            }
            Git.Merge m = git.tryMerge(tip, sha);
            if (!m.clean()) {
                stoppedAt = st.name;
                files = m.conflicts();
                error = m.error();
                break;
            }
            String next = git.mergeCommit(m.tree(), tip, sha);
            if (next == null) {
                stoppedAt = st.name;
                error = "git could not record the simulated merge";
                break;
            }
            tip = next;
            steps.add(st.name);
        }
        together = Json.obj("ok", Json.b(stoppedAt == null), "merged", Json.array(steps, Json::q),
                "stoppedAt", Json.q(stoppedAt), "conflicts", Json.array(files, Json::q), "error", Json.q(error));
    }

    private static String deployedSha(BranchState st) {
        synchronized (st) {
            return st.deployedSha;
        }
    }

    private int order(String branch) {
        int i = teamOrder.indexOf(branch.toLowerCase(Locale.ROOT));
        return i < 0 ? 1000 : i;
    }

    List<BranchState> snapshot() {
        synchronized (branches) {
            List<BranchState> list = new ArrayList<>(branches.values());
            list.sort(Comparator.comparingInt(s -> order(s.name)));
            return list;
        }
    }

    BranchState branch(String name) {
        synchronized (branches) {
            return branches.get(name);
        }
    }

    Git git() {
        return git;
    }

    /** A running site on a branch, by branch name and site name (e.g. "engine", "Engine"). */
    BranchState.App app(String branch, String site) {
        BranchState st = branch(branch);
        if (st == null) return null;
        synchronized (st) {
            for (BranchState.App a : st.apps) {
                if (a.name().equalsIgnoreCase(site) && "running".equals(a.status)) return a;
            }
        }
        return null;
    }

    String statusJson() {
        return Json.obj(
                "fetch", Json.obj("ok", Json.b(fetchOk), "error", Json.q(fetchError), "at", Long.toString(lastFetch),
                        "offline", Json.b(offline)),
                "activity", Json.q(activity),
                "public", tunnel == null ? Json.obj("enabled", "false", "protected", Json.b(passwordProtected))
                        : tunnel.toJson(passwordProtected),
                "intervalSeconds", Integer.toString(intervalSeconds),
                "now", Long.toString(System.currentTimeMillis()),
                "together", together,
                "branches", Json.array(snapshot(), BranchState::toJson));
    }

    void stopAll() {
        if (tunnel != null) tunnel.stop();
        for (BranchState st : snapshot()) builder.stop(st);
    }
}
