#!/usr/bin/env bash
# Build the fips-jni Rust library for Android and copy .so files into the app.
#
# Prerequisites:
#   cargo install cargo-ndk
#   rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android
#
# Usage:
#   ./scripts/build_android.sh [--release]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
JNI_DIR="$PROJECT_ROOT/app/src/main/jniLibs"

BUILD_PROFILE="${1:---debug}"
CARGO_FLAG=""
if [[ "$BUILD_PROFILE" == "--release" ]]; then
    CARGO_FLAG="--release"
    PROFILE="release"
else
    PROFILE="debug"
fi

echo "▶  Building fips-jni ($PROFILE) for Android targets..."

cd "$PROJECT_ROOT"

cargo ndk \
    -t aarch64-linux-android \
    -t armv7-linux-androideabi \
    -t x86_64-linux-android \
    -o "$JNI_DIR" \
    build $CARGO_FLAG \
    -p fips-jni

echo ""
echo "▶  Copied .so files:"
find "$JNI_DIR" -name "*.so" | while read -r f; do
    echo "   $(realpath --relative-to="$PROJECT_ROOT" "$f")  ($(du -sh "$f" | cut -f1))"
done

echo ""
echo "✓  Build complete. Run \`./gradlew assembleDebug\` to package the APK."
