#!/bin/sh
# Compile src/map/*.java and start the Java web server (JDK 17+).
# Falls back to Node.js mirror if javac/java are not installed locally.
#   ./run.sh          -> http://localhost:8080
#   ./run.sh 9000     -> http://localhost:9000
set -e
cd "$(dirname "$0")"

if command -v javac >/dev/null 2>&1 && command -v java >/dev/null 2>&1; then
  mkdir -p out
  javac -d out $(find src/map -name '*.java')
  exec java -cp out map.MapServer "$@"
elif command -v node >/dev/null 2>&1; then
  exec node tools/serve_map.mjs "$@"
else
  echo "Error: neither JDK (javac/java) nor Node.js was found in PATH." >&2
  exit 1
fi
