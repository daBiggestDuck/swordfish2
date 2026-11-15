package deployer;

import javax.tools.DiagnosticCollector;
import javax.tools.JavaCompiler;
import javax.tools.JavaFileObject;
import javax.tools.StandardJavaFileManager;
import javax.tools.ToolProvider;
import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/**
 * Builds and runs one branch:
 *  1. copies the branch's files into its own folder (git archive, so your own checkout is untouched)
 *  2. finds every Java web server under src/ (a class with main() that calls HttpServer.create)
 *  3. compiles with the JDK's built-in compiler (no scripts, so it works on Mac, Windows and Linux)
 *  4. starts each server on its own port: java -cp ... the.Server PORT
 */
final class Builder {

    private static final Pattern PACKAGE = Pattern.compile("^\\s*package\\s+([\\w.]+)\\s*;", Pattern.MULTILINE);
    private static final int READY_TIMEOUT_MS = 30_000;

    private final Git git;
    private final Path workRoot;
    private final int firstAppPort;
    private final Map<String, Integer> ports = new ConcurrentHashMap<>();
    private int nextPort;

    Builder(Git git, Path workRoot, int firstAppPort) {
        this.git = git;
        this.workRoot = workRoot;
        this.firstAppPort = firstAppPort;
        this.nextPort = firstAppPort;
    }

    /** Folder name for a branch. Adds a hash so "Data" and "data" don't collide on Mac/Windows. */
    static String safeName(String branch) {
        String base = branch.replaceAll("[^A-Za-z0-9._-]", "_");
        return base + "-" + Integer.toHexString(branch.hashCode() & 0xfffff);
    }

    void deploy(BranchState st, String sha) {
        stop(st);
        synchronized (st) {
            st.status = BranchState.Status.BUILDING;
            st.message = "Building " + sha.substring(0, 7);
            st.buildLog.setLength(0);
            st.apps.clear();
        }
        try {
            Path wt = checkout(st, sha);
            List<String> files = git.files(sha);
            List<String> pages = files.stream().filter(f -> f.toLowerCase(Locale.ROOT).endsWith(".html")).toList();
            synchronized (st) {
                st.worktree = wt;
                st.pages = pages;
                st.pageLinks = previewLinks(st.name, pages);
            }

            Map<String, String> servers = findServers(wt, files);
            if (servers.isEmpty()) {
                finish(st, BranchState.Status.NO_SITE, pages.isEmpty()
                        ? "No website on this branch yet: code only"
                        : "No Java server; HTML pages are shown as files");
                st.log("No Java web server found under src/ (a class with main() that calls HttpServer.create).");
                return;
            }
            st.log("Found servers: " + String.join(", ", servers.keySet()));

            Map<String, Path> classpathFor = compile(st, wt, files, servers);
            int running = 0;
            for (Map.Entry<String, String> s : servers.entrySet()) {
                String main = s.getKey();
                Path cp = classpathFor.get(main);
                BranchState.App app = new BranchState.App(main, portFor(st.name, main));
                synchronized (st) {
                    st.apps.add(app);
                }
                if (cp == null) {
                    app.status = "failed";
                    st.log("Not starting " + main + ": its code did not compile.");
                    continue;
                }
                if (start(st, wt, cp, app)) running++;
            }
            linkPages(st, pages);
            if (running == servers.size()) finish(st, BranchState.Status.RUNNING, "Running");
            else if (running > 0) finish(st, BranchState.Status.PARTLY_RUNNING, running + " of " + servers.size() + " sites running");
            else finish(st, BranchState.Status.FAILED, "Build or start failed: see the build log");
        } catch (Exception e) {
            st.log("ERROR: " + e);
            finish(st, BranchState.Status.FAILED, "Deploy failed: " + e.getMessage());
        }
    }

    private static void finish(BranchState st, BranchState.Status status, String message) {
        synchronized (st) {
            st.status = status;
            st.message = message;
            st.deployedAt = System.currentTimeMillis();
        }
    }

    // ------------------------------------------------------------------ checkout

    /**
     * Export the branch's files into its own folder with "git archive". This is a plain copy:
     * git and VS Code don't track it, and your own checkout is never touched.
     */
    private Path checkout(BranchState st, String sha) throws IOException {
        Path wt = workRoot.resolve(safeName(st.name));
        deleteTree(wt);
        Files.createDirectories(wt);
        Git.Out o = git.run("archive", "--format=zip", sha);
        if (!o.ok()) throw new IOException("git archive failed: " + o.stderr().strip());
        try (var zip = new java.util.zip.ZipInputStream(new java.io.ByteArrayInputStream(o.stdout()))) {
            for (var e = zip.getNextEntry(); e != null; e = zip.getNextEntry()) {
                Path target = wt.resolve(e.getName()).normalize();
                if (!target.startsWith(wt)) continue; // ignore anything that tries to escape the folder
                if (e.isDirectory()) {
                    Files.createDirectories(target);
                } else {
                    Files.createDirectories(target.getParent());
                    Files.copy(zip, target, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                    if (e.getName().endsWith(".sh")) target.toFile().setExecutable(true);
                }
            }
        }
        st.log("Checked out " + st.name + " @ " + sha.substring(0, 7) + " into " + wt);
        return wt;
    }

    /** Stop a deleted branch's sites and delete its copy. */
    void remove(BranchState st) {
        stop(st);
        try {
            deleteTree(workRoot.resolve(safeName(st.name)));
            List<BranchState.App> apps;
            synchronized (st) {
                apps = List.copyOf(st.apps);
            }
            for (BranchState.App a : apps) if (a.logFile != null) Files.deleteIfExists(a.logFile);
        } catch (IOException ignored) {
            // leftover temp files are harmless
        }
    }

    /** Start clean: remove copies left from an earlier run. */
    void cleanWorkRoot() {
        try {
            deleteTree(workRoot);
        } catch (IOException e) {
            System.err.println("Could not clean " + workRoot + ": " + e.getMessage());
        }
    }

    static void deleteTree(Path p) throws IOException {
        if (!Files.exists(p)) return;
        try (Stream<Path> s = Files.walk(p)) {
            for (Path f : s.sorted(Comparator.reverseOrder()).toList()) {
                f.toFile().setWritable(true);
                Files.deleteIfExists(f);
            }
        }
    }

    // ------------------------------------------------------------------ find + compile

    private static boolean isSource(String f) {
        return f.startsWith("src/") && f.endsWith(".java") && !f.startsWith("src/test/") && !f.contains("/test/");
    }

    /** main class -> its top-level source folder (src/<top>). */
    private static Map<String, String> findServers(Path wt, List<String> files) throws IOException {
        Map<String, String> out = new TreeMap<>();
        for (String f : files) {
            if (!isSource(f)) continue;
            String code = Files.readString(wt.resolve(f), StandardCharsets.UTF_8);
            if (!code.contains("HttpServer.create") || !code.contains("static void main")) continue;
            Matcher m = PACKAGE.matcher(code);
            String cls = Path.of(f).getFileName().toString().replace(".java", "");
            String fqn = m.find() ? m.group(1) + "." + cls : cls;
            out.put(fqn, topFolder(f));
        }
        return out;
    }

    private static String topFolder(String f) {
        String[] parts = f.split("/");
        return parts.length > 2 ? "src/" + parts[1] : "src";
    }

    /**
     * Compile everything under src/ together. If that fails (one person's code is broken), compile
     * each src/<folder> on its own so the other sites still run. Returns main class -> classpath.
     */
    private Map<String, Path> compile(BranchState st, Path wt, List<String> files, Map<String, String> servers)
            throws IOException {
        JavaCompiler javac = ToolProvider.getSystemJavaCompiler();
        if (javac == null) throw new IOException("No Java compiler found. Install a JDK (17+), not just a JRE.");

        List<Path> all = files.stream().filter(Builder::isSource).map(wt::resolve).toList();
        Path outAll = wt.resolve(".deploy-out/all");
        Map<String, Path> result = new LinkedHashMap<>();
        if (compileInto(javac, st, all, outAll, "all of src/")) {
            for (String main : servers.keySet()) result.put(main, outAll);
            return result;
        }

        st.log("Compiling each folder separately so working parts can still run...");
        Map<String, List<Path>> byTop = new TreeMap<>();
        for (String f : files) if (isSource(f)) byTop.computeIfAbsent(topFolder(f), k -> new ArrayList<>()).add(wt.resolve(f));
        Map<String, Path> okTops = new LinkedHashMap<>();
        for (Map.Entry<String, List<Path>> e : byTop.entrySet()) {
            Path out = wt.resolve(".deploy-out/" + e.getKey().replace('/', '_'));
            if (compileInto(javac, st, e.getValue(), out, e.getKey())) okTops.put(e.getKey(), out);
        }
        for (Map.Entry<String, String> s : servers.entrySet()) {
            if (okTops.containsKey(s.getValue())) result.put(s.getKey(), okTops.get(s.getValue()));
        }
        return result;
    }

    private static boolean compileInto(JavaCompiler javac, BranchState st, List<Path> sources, Path out, String label)
            throws IOException {
        Files.createDirectories(out);
        DiagnosticCollector<JavaFileObject> diags = new DiagnosticCollector<>();
        try (StandardJavaFileManager fm = javac.getStandardFileManager(diags, Locale.ROOT, StandardCharsets.UTF_8)) {
            Iterable<? extends JavaFileObject> units = fm.getJavaFileObjectsFromPaths(sources);
            List<String> options = List.of("-d", out.toString(), "-encoding", "UTF-8", "-nowarn", "-Xlint:none");
            boolean ok = javac.getTask(null, fm, diags, options, null, units).call();
            for (var d : diags.getDiagnostics()) {
                if (d.getKind() == javax.tools.Diagnostic.Kind.ERROR) {
                    String src = d.getSource() == null ? "" : Path.of(d.getSource().toUri()).getFileName() + ":" + d.getLineNumber() + " ";
                    st.log("  " + src + d.getMessage(Locale.ROOT));
                }
            }
            st.log((ok ? "Compiled " : "Compile FAILED: ") + label + " (" + sources.size() + " files)");
            return ok;
        }
    }

    // ------------------------------------------------------------------ pages

    /** Link for a page that no running site serves: the deployer shows the file straight from git. */
    static String previewUrl(String branch, String page) {
        return "/preview/" + java.net.URLEncoder.encode(branch, StandardCharsets.UTF_8).replace("+", "%20") + "/" + page;
    }

    private static List<String[]> previewLinks(String branch, List<String> pages) {
        return pages.stream().map(p -> new String[] {p, previewUrl(branch, p), "preview"}).toList();
    }

    /** For each HTML page, find which running site serves it (e.g. web/story/index.html -> /). */
    private static void linkPages(BranchState st, List<String> pages) {
        List<BranchState.App> up;
        synchronized (st) {
            up = st.apps.stream().filter(a -> "running".equals(a.status)).toList();
        }
        List<String[]> links = new ArrayList<>();
        for (String page : pages) {
            String found = null;
            if (page.startsWith("web/")) {
                List<String> candidates = new ArrayList<>();
                String rest = page.substring(4);
                while (true) {
                    candidates.add(rest);
                    if (rest.endsWith("index.html")) candidates.add(rest.substring(0, rest.length() - "index.html".length()));
                    int slash = rest.indexOf('/');
                    if (slash < 0) break;
                    rest = rest.substring(slash + 1);
                }
                outer:
                for (BranchState.App app : up) {
                    for (String c : candidates) {
                        String url = "http://localhost:" + app.port + "/" + c;
                        if (isHtml(url)) {
                            found = url;
                            break outer;
                        }
                    }
                }
            }
            links.add(found != null ? new String[] {page, found, "live"} : new String[] {page, previewUrl(st.name, page), "preview"});
        }
        synchronized (st) {
            st.pageLinks = links;
        }
    }

    private static boolean isHtml(String url) {
        try {
            var c = (java.net.HttpURLConnection) java.net.URI.create(url).toURL().openConnection();
            c.setConnectTimeout(1000);
            c.setReadTimeout(2000);
            int code = c.getResponseCode();
            String type = c.getContentType();
            c.disconnect();
            return code == 200 && type != null && type.startsWith("text/html");
        } catch (IOException | IllegalArgumentException e) {
            return false;
        }
    }

    // ------------------------------------------------------------------ run

    private synchronized int portFor(String branch, String main) {
        return ports.computeIfAbsent(branch + "/" + main, k -> {
            while (!portFree(nextPort)) nextPort++;
            return nextPort++;
        });
    }

    private static boolean portFree(int port) {
        try (ServerSocket s = new ServerSocket()) {
            s.setReuseAddress(true);
            s.bind(new InetSocketAddress(InetAddress.getLoopbackAddress(), port));
            return true;
        } catch (IOException e) {
            return false;
        }
    }

    private boolean start(BranchState st, Path wt, Path classpath, BranchState.App app) throws IOException, InterruptedException {
        String exe = System.getProperty("os.name").toLowerCase(Locale.ROOT).contains("win") ? "java.exe" : "java";
        Path java = Path.of(System.getProperty("java.home"), "bin", exe);
        Path log = workRoot.resolve(safeName(st.name) + "-" + app.name() + ".log");
        Files.deleteIfExists(log);
        ProcessBuilder pb = new ProcessBuilder(java.toString(), "-cp", classpath.toString(), app.mainClass,
                Integer.toString(app.port))
                .directory(wt.toFile())
                .redirectErrorStream(true)
                .redirectOutput(log.toFile());
        st.log("Starting " + app.mainClass + " on http://localhost:" + app.port + "/");
        Process p = pb.start();
        app.process = p;
        app.logFile = log;

        long deadline = System.currentTimeMillis() + READY_TIMEOUT_MS;
        while (System.currentTimeMillis() < deadline) {
            if (!p.isAlive()) {
                app.status = "failed";
                st.log("  " + app.name() + " exited with code " + p.exitValue() + ". Its output:");
                st.log(indent(tail(log, 40)));
                return false;
            }
            if (listening(app.port)) {
                app.status = "running";
                st.log("  " + app.name() + " is up.");
                return true;
            }
            Thread.sleep(250);
        }
        app.status = "failed";
        st.log("  " + app.name() + " did not open port " + app.port + " within " + READY_TIMEOUT_MS / 1000 + " s.");
        return false;
    }

    private static boolean listening(int port) {
        try (Socket s = new Socket()) {
            s.connect(new InetSocketAddress(InetAddress.getLoopbackAddress(), port), 300);
            return true;
        } catch (IOException e) {
            return false;
        }
    }

    void stop(BranchState st) {
        List<BranchState.App> apps;
        synchronized (st) {
            apps = List.copyOf(st.apps);
        }
        for (BranchState.App app : apps) {
            Process p = app.process;
            if (p == null) continue;
            p.descendants().forEach(ProcessHandle::destroy);
            p.destroy();
            try {
                if (!p.waitFor(5, java.util.concurrent.TimeUnit.SECONDS)) p.destroyForcibly().waitFor();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            app.status = "stopped";
        }
    }

    /** Re-check that running apps are still alive (someone's server may crash later). */
    void checkHealth(BranchState st) {
        synchronized (st) {
            boolean anyDied = false;
            for (BranchState.App app : st.apps) {
                if ("running".equals(app.status) && app.process != null && !app.process.isAlive()) {
                    app.status = "failed";
                    anyDied = true;
                    st.log(app.name() + " stopped unexpectedly (exit code " + app.process.exitValue() + ").");
                }
            }
            if (anyDied) {
                long up = st.apps.stream().filter(a -> "running".equals(a.status)).count();
                st.status = up == 0 ? BranchState.Status.FAILED : BranchState.Status.PARTLY_RUNNING;
                st.message = up == 0 ? "Site crashed: see the logs" : up + " of " + st.apps.size() + " sites running";
            }
        }
    }

    static String tail(Path file, int lines) {
        try {
            if (file == null || !Files.exists(file)) return "";
            List<String> all = Files.readAllLines(file, StandardCharsets.UTF_8);
            return String.join("\n", all.subList(Math.max(0, all.size() - lines), all.size()));
        } catch (IOException e) {
            return "(could not read log: " + e.getMessage() + ")";
        }
    }

    private static String indent(String s) {
        return s.isEmpty() ? "    (no output)" : "    " + s.replace("\n", "\n    ");
    }

    int firstAppPort() {
        return firstAppPort;
    }
}
