#!/usr/bin/env bash
# Serve the Payload Pets v0 showcase shell (tabbed index.html).
#   ./run-v0.sh                 -> http://localhost:8765/   (also starts Engine :8082 + Story :8081 if a JDK is present)
#   ./run-v0.sh 9000            -> http://localhost:9000/
#   ./run-v0.sh --no-backends   -> shell only (Engine tab falls back to demos/js-engine)
#
# Map / Navigator / Pets / Data / About work from the shell alone. Engine and Story are Java servers;
# this script starts them in the background (logs in out/logs/) and stops them when you press Ctrl+C.
# If one is already running on its port, it is reused, not restarted.
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

start_backend() { # name port script
  local name="$1" port="$2" script="$3"
  if port_busy "$port"; then
    echo "  $name: already running on :$port (reusing it)"
    return
  fi
  mkdir -p out/logs
  "./$script" "$port" >"out/logs/$name.log" 2>&1 &
  PIDS+=("$!")
  echo "  $name: starting on :$port (log: out/logs/$name.log)"
}

echo "Payload Pets v0 showcase"
echo "  Shell:  http://localhost:${PORT}/"
echo "  Tabs:   Map/Sites · Navigator · Story/Passport · Engine/Care · Pets · Data/Missions · About"
echo ""

if [ "$BACKENDS" = 1 ]; then
  if command -v javac >/dev/null 2>&1 && javac -version >/dev/null 2>&1; then
    echo "Java backends:"
    start_backend engine 8082 run-engine.sh
    start_backend story 8081 run-story.sh
    # Wait (up to ~20 s) for the engine so the Engine tab is live on first click.
    for _ in $(seq 1 40); do
      port_busy 8082 && break
      sleep 0.5
    done
    if port_busy 8082; then echo "  engine: ready → http://localhost:8082/"; else echo "  engine: not up yet; see out/logs/engine.log (the tab switches over by itself once it is)"; fi
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
