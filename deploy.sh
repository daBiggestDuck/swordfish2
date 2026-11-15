#!/bin/sh
# Start the Payload Pets deployer: a local dashboard of every branch on GitHub.
# Needs only a JDK (Java 17+) and git. Runs on this computer only.
#   ./deploy.sh                 -> http://localhost:8000
#   ./deploy.sh --port 9000     -> http://localhost:9000
#   ./deploy.sh --interval 10   -> check GitHub every 10 s (default 30)
#   ./deploy.sh --offline       -> don't contact GitHub; use branches already downloaded
set -e
cd "$(dirname "$0")"
OUT="${TMPDIR:-/tmp}/payload-pets-deployer-build"
rm -rf "$OUT" && mkdir -p "$OUT"
javac -d "$OUT" deployer/src/deployer/*.java
cp -R deployer/web "$OUT/web"
exec java -cp "$OUT" deployer.Deployer "$@"
