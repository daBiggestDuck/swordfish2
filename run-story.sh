#!/bin/sh
# Compile the story code and start its Java web server. Needs only a JDK (Java 17+).
#   ./run-story.sh                    -> http://localhost:8081
#   ./run-story.sh 9000               -> http://localhost:9000
#   ./run-story.sh --data some/dir    -> read the data branch's JSON from another folder
# If a data/ folder exists (from the data branch), the story uses it automatically.
set -e
cd "$(dirname "$0")"
OUT="${TMPDIR:-/tmp}/payload-pets-story-build"
mkdir -p "$OUT"
javac -d "$OUT" src/story/*.java
exec java -cp "$OUT" story.StoryServer "$@"
