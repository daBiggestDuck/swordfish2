#!/bin/sh
# Compile the engine and start its local web server. Needs only a JDK (Java 17+). Offline.
#   ./run-engine.sh          -> http://localhost:8082
#   ./run-engine.sh 9000     -> http://localhost:9000
set -e
cd "$(dirname "$0")"
rm -rf out/engine && mkdir -p out/engine
javac -d out/engine $(find src/engine -name '*.java')
exec java -cp out/engine engine.EngineServer "$@"
