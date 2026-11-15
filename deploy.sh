#!/bin/sh
# Start the Payload Pets deployer: a local dashboard of every branch on GitHub.
# Needs only a JDK (Java 17+) and git. Runs on this computer only.
#   ./deploy.sh                 -> http://localhost:8000
#   ./deploy.sh --port 9000     -> http://localhost:9000
#   ./deploy.sh --interval 10   -> check GitHub every 10 s (default 30)
#   ./deploy.sh --offline       -> don't contact GitHub; use branches already downloaded
set -e
cd "$(dirname "$0")"
if ! command -v javac >/dev/null 2>&1 || ! javac -version >/dev/null 2>&1; then
  echo "Java (JDK 17 or newer) is not installed. Get it from https://adoptium.net and run this again." >&2
  exit 1
fi
if ! command -v git >/dev/null 2>&1; then
  echo "git is not installed. Get it from https://git-scm.com and run this again." >&2
  exit 1
fi
OUT="${TMPDIR:-/tmp}/payload-pets-deployer-build"
rm -rf "$OUT" && mkdir -p "$OUT"
javac -d "$OUT" deployer/src/deployer/*.java
cp -R deployer/web "$OUT/web"
exec java -cp "$OUT" deployer.Deployer "$@"
