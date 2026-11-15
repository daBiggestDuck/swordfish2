# Deployer

One dashboard that shows **every branch** on GitHub: who owns it, its latest commits, all its code, and its website running live. Push to your branch and the deployer rebuilds it within 30 seconds. Nobody has to do anything else.

## Start it

**First time only:** get the deployer onto your computer. Once it's merged into `main` you'll already have it; until then:

```
git fetch
git checkout deployer
```


You need **git** and a **JDK 17 or newer**, the same as for the rest of the project.

| Computer | Command | Then open |
|---|---|---|
| Mac / Linux | `./deploy.sh` | http://localhost:8000 |
| Windows | double-click `deploy.cmd` (or `.\deploy.ps1` in PowerShell) | http://localhost:8000 |

Stop it with **Ctrl+C**. That also stops every branch site it started.

Options: `--port 9000` (dashboard port), `--interval 10` (check GitHub every 10 s), `--offline` (don't contact GitHub; use what's already downloaded), `--apps-from 8100` (first port for branch sites).

## What you see

- **Dashboard (`/`):** a table of every branch: owner, what goes on it, latest commit, whether it's **in main / merges cleanly / conflicts with main** (and which files), its site status and an **Open** button for each running site. Below it, the flow every branch takes into main (branch → pull request → `main` → live demo), and a dry run of merging **all** team branches into main in order, which names the first branch and files that would clash. The dry run happens inside git only: no branch is changed and nothing is pushed.
- **Branch page:** a live preview of the branch's site (one tab per site if it has several), every HTML page on the branch, recent commits, the full file tree, the build log and the server output.
- **Code viewer:** any file on any branch, with line numbers. Line links like `#L42` work.

Statuses: **Running**, **Building…**, **Code only** (no web server on the branch yet), **Failed** (the build log shows the exact compile error and line).

## How a branch gets a live site

There's nothing to set up. The deployer:

1. copies the branch's latest commit into its own temp folder (`git archive`). Your own checkout and branches are never touched.
2. finds every Java class under `src/` that has a `main` method and calls `HttpServer.create`.
3. compiles `src/` with the JDK's built-in compiler. If one folder doesn't compile, the others still run.
4. starts each server like this, from the branch's root folder: `java -cp <build> your.Server <port>`.

So your server must **read the port from `args[0]`** and serve files relative to the repo root (e.g. `Path.of("web")`). The engine, story and map servers already do this. Branch sites get ports 8100, 8101, …

HTML pages that no server serves still open as a **file preview** straight from git.

## Notes

- **The deployer only sees what's pushed.** Commit and **Sync** (push) your branch to see it here.
- It needs to be able to reach GitHub. If you can Sync in VS Code, it can too. If not, a red banner says so, and it keeps showing the last code it downloaded.
- Everything runs on your own computer (`localhost`). Each teammate runs their own copy and sees the same branches.
- Owners and roles come from `deployer/branches.properties`. Edit it to add names.
- It runs your teammates' code on your computer, the same as running their `run.sh` would.
