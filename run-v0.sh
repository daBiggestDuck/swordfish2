#!/usr/bin/env bash
# Serve the Payload Pets v0 showcase shell (tabbed index.html).
#   ./run-v0.sh                 -> http://localhost:8765/   (also starts Engine :8082 + Story :8081 if a JDK is present)
#   ./run-v0.sh 9000            -> http://localhost:9000/
#   ./run-v0.sh --no-backends   -> shell only (Engine tab falls back to demos/js-engine)
#
# Map / Navigator / Pets / Data / About work from the shell alone. Engine and Story are Java servers;
# this script starts them in the background (logs in out/logs/) and stops them when you press Ctrl+C.
# A server already on its port is reused only if its page actually loads; otherwise a fresh one starts
# on the backup port (engine :8083, story :8084), which the shell also checks. Nothing is ever killed.
set -euo pipefail
cd "$(dirname "$0")"

PORT=8765
BACKENDS=1
for arg in "$@"; do
  case "$arg" in
    --no-backends) BACKENDS=0 ;;
    ''|*[!0-9]*) echo "Unknown option: $arg (use a port number or --no-backends)" >&2; exit 2 ;;
    *) PORT="$arg" ;;
  esac
done

port_busy() {
  # true if something is already listening on 127.0.0.1:$1
  (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null
}

PIDS=()
cleanup() {
  for pid in "${PIDS[@]:-}"; do
    [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
  done
}
trap cleanup EXIT INT TERM

http_ok() { # url -> true on HTTP 200
  [ "$(curl -s -m 3 -o /dev/null -w '%{http_code}' "$1" 2>/dev/null)" = "200" ]
}

# A server is only reused when its API answers AND its page loads. A server left running after its
# folder was deleted still answers the API but 404s every page (the tab would just say "Not found").
backend_healthy() { # port apiPath pagePath
  http_ok "http://127.0.0.1:$1$2" && http_ok "http://127.0.0.1:$1$3"
}

ENGINE_PORT=8082
STORY_PORT=8081

start_backend() { # name port backupPort script apiPath pagePath  -> sets <NAME>_PORT
  local name="$1" port="$2" backup="$3" script="$4" api="$5" page="$6"
  local chosen=""
  for p in "$port" "$backup"; do
    if port_busy "$p"; then
      if backend_healthy "$p" "$api" "$page"; then
        echo "  $name: already running on :$p (reusing it)"
        chosen="$p"
        break
      fi
      local pid
      pid="$(lsof -t -nP -iTCP:"$p" -sTCP:LISTEN 2>/dev/null | head -1 || true)"
      echo "  $name: :$p is held by a server whose pages are missing (PID ${pid:-unknown}). Stop it with: kill ${pid:-<pid>}"
      continue
    fi
    mkdir -p out/logs
    "./$script" "$p" >"out/logs/$name.log" 2>&1 &
    PIDS+=("$!")
    echo "  $name: starting on :$p (log: out/logs/$name.log)"
    chosen="$p"
    break
  done
  if [ -z "$chosen" ]; then
    echo "  $name: no free port ($port, $backup); the tab will use its built-in fallback"
    chosen="$port"
  fi
  if [ "$name" = engine ]; then ENGINE_PORT="$chosen"; else STORY_PORT="$chosen"; fi
}

echo "Payload Pets v0 showcase"
echo "  Shell:  http://localhost:${PORT}/"
echo "  Tabs:   Map/Sites · Navigator · Story/Passport · Engine/Care · Pets · Data/Missions · About"
echo ""

if [ "$BACKENDS" = 1 ]; then
  if command -v javac >/dev/null 2>&1 && javac -version >/dev/null 2>&1; then
    echo "Java backends:"
    start_backend engine 8082 8083 run-engine.sh /api/engine/facts /engine.html
    start_backend story 8081 8084 run-story.sh /api/missions /
    # Wait (up to ~20 s) for the engine so the Engine tab is live on first click.
    for _ in $(seq 1 40); do
      backend_healthy "$ENGINE_PORT" /api/engine/facts /engine.html && break
      sleep 0.5
    done
    if backend_healthy "$ENGINE_PORT" /api/engine/facts /engine.html; then
      echo "  engine: ready → http://localhost:${ENGINE_PORT}/"
    else
      echo "  engine: not up yet; see out/logs/engine.log (the tab switches over by itself once it is)"
    fi
  else
    echo "No JDK found: Engine tab will show the JS fallback. Install Java 17+ (https://adoptium.net) for the full engine."
  fi
  echo ""
fi

if port_busy "$PORT"; then
  echo "Port $PORT is already in use. Open http://localhost:${PORT}/ or pass another port: ./run-v0.sh 9000" >&2
  exit 1
fi

if command -v python3 >/dev/null 2>&1; then
  echo "Serving repo root with python3 (Ctrl+C to stop everything)…"
  python3 -m http.server "$PORT" --bind 127.0.0.1
elif command -v python >/dev/null 2>&1; then
  echo "Serving repo root with python (Ctrl+C to stop everything)…"
  python -m http.server "$PORT" --bind 127.0.0.1
elif command -v npx >/dev/null 2>&1; then
  echo "Serving repo root with npx serve (Ctrl+C to stop everything)…"
  npx --yes serve -l "tcp://127.0.0.1:${PORT}" .
else
  echo "Error: need python3, python, or npx to serve the showcase." >&2
  exit 1
fi
