#!/bin/bash
set -e

echo "🚀 Starting APK Build Process..."

# Ensure we are in the project root
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the project root."
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Initialize Android project if not already present
if [ ! -d "src-tauri/gen/android" ]; then
    echo "🤖 Initializing Android project..."
    npx tauri android init
fi

# Fix missing adaptive icon
echo "🎨 Fixing adaptive icon..."
RES_DIR="src-tauri/gen/android/app/src/main/res"
mkdir -p "$RES_DIR/mipmap-anydpi-v26"
cat <<EOF > "$RES_DIR/mipmap-anydpi-v26/ic_launcher.xml"
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
EOF
cat <<EOF > "$RES_DIR/mipmap-anydpi-v26/ic_launcher_round.xml"
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
EOF
cat <<EOF > "$RES_DIR/mipmap-anydpi-v26/ic_launcher_round.xml"
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
EOF

# Ensure AndroidManifest.xml has roundIcon
MANIFEST="src-tauri/gen/android/app/src/main/AndroidManifest.xml"
if ! grep -q "android:roundIcon" "$MANIFEST"; then
    sed -i '' 's/android:icon="@mipmap\/ic_launcher"/android:icon="@mipmap\/ic_launcher" android:roundIcon="@mipmap\/ic_launcher_round"/' "$MANIFEST"
fi

# Ensure signing key exists
KEYSTORE_PATH="src-tauri/gen/android/app/release.keystore"
if [ ! -f "$KEYSTORE_PATH" ]; then
    echo "🔑 Generating signing key..."
    mkdir -p "$(dirname "$KEYSTORE_PATH")"
    keytool -genkey -v -keystore "$KEYSTORE_PATH" -alias fips -keyalg RSA -keysize 2048 -validity 10000 -storepass password -keypass password -dname "CN=fips, OU=fips, O=fips, L=fips, S=fips, C=US"
fi

# Build the APK
echo "🔨 Building Android APK..."
export TAURI_ANDROID_KEYSTORE=$PWD/src-tauri/gen/android/app/release.keystore
export TAURI_ANDROID_KEYSTORE_PASSWORD=password
export TAURI_ANDROID_KEY_ALIAS=fips
export TAURI_ANDROID_KEY_PASSWORD=password

npx tauri android build --apk --ci

# Define paths
RELEASE_DIR="src-tauri/gen/android/app/build/outputs/apk/universal/release"
SOURCE_SIGNED="$RELEASE_DIR/app-universal-release.apk"
SOURCE_UNSIGNED="$RELEASE_DIR/app-universal-release-unsigned.apk"
DEST_DIR="releases"
DEST_FILE="$DEST_DIR/app-release.apk"

# Check if build succeeded and move file
if [ -f "$SOURCE_SIGNED" ]; then
    mkdir -p "$DEST_DIR"
    cp "$SOURCE_SIGNED" "$DEST_FILE"
    echo "✅ Success! Signed APK is ready."
    echo "📍 Location: $DEST_FILE"
elif [ -f "$SOURCE_UNSIGNED" ]; then
    mkdir -p "$DEST_DIR"
    
    # Try to sign manually if apksigner is available
    APKSIGNER=$(find ~/Library/Android/sdk/build-tools -name apksigner | sort -r | head -n 1)
    if [ -n "$APKSIGNER" ]; then
        echo "✍️  Signing APK manually..."
        "$APKSIGNER" sign --ks "$TAURI_ANDROID_KEYSTORE" --ks-key-alias "$TAURI_ANDROID_KEY_ALIAS" --ks-pass pass:"$TAURI_ANDROID_KEYSTORE_PASSWORD" --key-pass pass:"$TAURI_ANDROID_KEY_PASSWORD" --out "$DEST_FILE" "$SOURCE_UNSIGNED"
        echo "✅ Success! Signed APK is ready (manually signed)."
    else
        cp "$SOURCE_UNSIGNED" "$DEST_FILE"
        echo "⚠️  Success! Unsigned APK is ready (apksigner not found)."
    fi
    echo "📍 Location: $DEST_FILE"
else
    echo "❌ Build failed. APK not found at expected location: $RELEASE_DIR"
    exit 1
fi
