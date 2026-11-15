#!/usr/bin/env bash
# Serve the Payload Pets v0 showcase shell (tabbed index.html).
#   ./run-v0.sh           -> http://localhost:8765/
#   ./run-v0.sh 9000      -> http://localhost:9000/
#
# Map / Pets / Data / About work from this process alone.
# Story (:8081) and Engine (:8082) need their Java servers in other terminals:
#   ./run-story.sh
#   ./run-engine.sh
set -e
cd "$(dirname "$0")"
PORT="${1:-8765}"

echo "Payload Pets v0 showcase"
echo "  Shell:  http://localhost:${PORT}/"
echo "  Tabs:   Map/Sites · Story/Passport · Engine/Care · Pets · Data/Missions · About"
echo ""
echo "Optional Java backends (separate terminals):"
echo "  ./run-story.sh    -> http://localhost:8081/   (Story / Passport)"
echo "  ./run-engine.sh   -> http://localhost:8082/   (Engine / Care)"
echo "  ./run_map.sh      -> http://localhost:8080/   (map API; static map tab usually enough)"
echo ""

if command -v python3 >/dev/null 2>&1; then
  echo "Serving repo root with python3 (Ctrl+C to stop)…"
  exec python3 -m http.server "$PORT" --bind 127.0.0.1
elif command -v python >/dev/null 2>&1; then
  echo "Serving repo root with python (Ctrl+C to stop)…"
  exec python -m http.server "$PORT" --bind 127.0.0.1
elif command -v npx >/dev/null 2>&1; then
  echo "Serving repo root with npx serve (Ctrl+C to stop)…"
  exec npx --yes serve -l "tcp://127.0.0.1:${PORT}" .
else
  echo "Error: need python3, python, or npx to serve the showcase." >&2
  exit 1
fi
