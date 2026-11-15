#!/usr/bin/env bash
# Compile and run the data pipeline.
#
# Usage:
#   ./build.sh           # online mode: fetches from JPL Horizons + Moon Trek
#   ./build.sh --offline # offline mode: skips network, uses placeholders
#
set -euo pipefail
cd "$(dirname "$0")"

echo "Compiling..."
rm -rf build
mkdir -p build
javac -d build src/data/*.java

echo "Running data pipeline..."
java -cp build data.BuildData "$@"
