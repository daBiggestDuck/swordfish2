#!/bin/sh
# Compile the engine and run its tests + balance report. Needs only a JDK (Java 17+). Offline.
set -e
cd "$(dirname "$0")"
rm -rf out/engine-test && mkdir -p out/engine-test
javac -d out/engine-test $(find src/engine test/engine -name '*.java')
exec java -cp out/engine-test engine.EngineTest
