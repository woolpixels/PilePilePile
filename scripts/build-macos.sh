#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_ROOT="$PROJECT_DIR/Build"
APP_NAME="堆堆堆"
APP_VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$PROJECT_DIR/macos/Info.plist")"
SDK_PATH="$(xcrun --sdk macosx --show-sdk-path)"

DEVELOPER_ID_NAME="Developer ID Application: Hui Liu (HB3KFA599J)"
DEVELOPER_ID_SHA1="1D43B85F453468D136A9FDC03842A9032293E5F7"
TEAM_ID="HB3KFA599J"
NOTARY_PROFILE="${NOTARY_PROFILE:-PilePilePile-Notary}"

BUILD_MODE="development"
case "${1:-}" in
  "") ;;
  --release) BUILD_MODE="release" ;;
  -h|--help)
    echo "Usage: $0 [--release]"
    echo "  default     Build a development DMG with an ad-hoc signature."
    echo "  --release   Developer ID sign, notarize, staple, and verify the release DMG."
    exit 0
    ;;
  *)
    echo "Unknown option: $1" >&2
    echo "Usage: $0 [--release]" >&2
    exit 2
    ;;
esac

if (( $# > 1 )); then
  echo "Only one option is supported: --release" >&2
  exit 2
fi

BUILD_DIR="$BUILD_ROOT/$BUILD_MODE"
APP_BUNDLE="$BUILD_DIR/$APP_NAME.app"
CONTENTS_DIR="$APP_BUNDLE/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"
WEB_DIR="$RESOURCES_DIR/Web"
ICONSET_DIR="$BUILD_DIR/AppIcon.iconset"
MODULE_CACHE_DIR="$BUILD_DIR/module-cache"

SIGN_IDENTITY="-"
if [[ "$BUILD_MODE" == "release" ]]; then
  echo "Checking Developer ID Application identities..."
  IDENTITY_OUTPUT="$(security find-identity -v -p codesigning)"
  echo "$IDENTITY_OUTPUT"

  NAME_MATCH_COUNT="$(printf '%s\n' "$IDENTITY_OUTPUT" | awk -v name="\"$DEVELOPER_ID_NAME\"" 'index($0, name) { count++ } END { print count + 0 }')"
  if [[ "$NAME_MATCH_COUNT" -eq 0 ]]; then
    echo "Release blocked: $DEVELOPER_ID_NAME is not a valid codesigning identity." >&2
    exit 1
  fi

  if ! printf '%s\n' "$IDENTITY_OUTPUT" | grep -Fq "$DEVELOPER_ID_SHA1 \"$DEVELOPER_ID_NAME\""; then
    echo "Release blocked: expected SHA-1 identity $DEVELOPER_ID_SHA1 is not valid for $DEVELOPER_ID_NAME." >&2
    exit 1
  fi

  if [[ "$NAME_MATCH_COUNT" -gt 1 ]]; then
    echo "Found $NAME_MATCH_COUNT certificates with the same display name; using the pinned SHA-1 identity."
  fi
  SIGN_IDENTITY="$DEVELOPER_ID_SHA1"

  echo "Checking notarization keychain profile: $NOTARY_PROFILE"
  if ! xcrun notarytool history --keychain-profile "$NOTARY_PROFILE" --output-format json >/dev/null; then
    echo "Release blocked: notarization keychain profile '$NOTARY_PROFILE' is unavailable or invalid." >&2
    echo "Configure it with notarytool store-credentials, or set NOTARY_PROFILE to an existing profile." >&2
    exit 1
  fi

  DMG_PATH="$BUILD_DIR/$APP_NAME-$APP_VERSION-universal.dmg"
else
  DMG_PATH="$BUILD_DIR/$APP_NAME-$APP_VERSION-development-universal.dmg"
fi

rm -rf "$BUILD_DIR"
mkdir -p "$MACOS_DIR" "$WEB_DIR" "$ICONSET_DIR" "$MODULE_CACHE_DIR"

xcrun swiftc \
  -target arm64-apple-macosx12.0 \
  -sdk "$SDK_PATH" \
  -module-cache-path "$MODULE_CACHE_DIR" \
  "$PROJECT_DIR/macos/main.swift" \
  -o "$BUILD_DIR/PilePilePile-arm64" \
  -framework Cocoa \
  -framework WebKit

xcrun swiftc \
  -target x86_64-apple-macosx12.0 \
  -sdk "$SDK_PATH" \
  -module-cache-path "$MODULE_CACHE_DIR" \
  "$PROJECT_DIR/macos/main.swift" \
  -o "$BUILD_DIR/PilePilePile-x86_64" \
  -framework Cocoa \
  -framework WebKit

lipo -create \
  "$BUILD_DIR/PilePilePile-arm64" \
  "$BUILD_DIR/PilePilePile-x86_64" \
  -output "$MACOS_DIR/PilePilePile"

cp "$PROJECT_DIR/macos/Info.plist" "$CONTENTS_DIR/Info.plist"
ditto "$PROJECT_DIR/index.html" "$WEB_DIR/index.html"
ditto "$PROJECT_DIR/styles.css" "$WEB_DIR/styles.css"
ditto "$PROJECT_DIR/app.js" "$WEB_DIR/app.js"
ditto "$PROJECT_DIR/assets" "$WEB_DIR/assets"

sips -z 16 16 "$PROJECT_DIR/macos/AppIcon.png" --out "$ICONSET_DIR/icon_16x16.png" >/dev/null
sips -z 32 32 "$PROJECT_DIR/macos/AppIcon.png" --out "$ICONSET_DIR/icon_16x16@2x.png" >/dev/null
sips -z 32 32 "$PROJECT_DIR/macos/AppIcon.png" --out "$ICONSET_DIR/icon_32x32.png" >/dev/null
sips -z 64 64 "$PROJECT_DIR/macos/AppIcon.png" --out "$ICONSET_DIR/icon_32x32@2x.png" >/dev/null
sips -z 128 128 "$PROJECT_DIR/macos/AppIcon.png" --out "$ICONSET_DIR/icon_128x128.png" >/dev/null
sips -z 256 256 "$PROJECT_DIR/macos/AppIcon.png" --out "$ICONSET_DIR/icon_128x128@2x.png" >/dev/null
sips -z 256 256 "$PROJECT_DIR/macos/AppIcon.png" --out "$ICONSET_DIR/icon_256x256.png" >/dev/null
sips -z 512 512 "$PROJECT_DIR/macos/AppIcon.png" --out "$ICONSET_DIR/icon_256x256@2x.png" >/dev/null
sips -z 512 512 "$PROJECT_DIR/macos/AppIcon.png" --out "$ICONSET_DIR/icon_512x512.png" >/dev/null
sips -z 1024 1024 "$PROJECT_DIR/macos/AppIcon.png" --out "$ICONSET_DIR/icon_512x512@2x.png" >/dev/null
iconutil -c icns "$ICONSET_DIR" -o "$RESOURCES_DIR/AppIcon.icns"

chmod +x "$MACOS_DIR/PilePilePile"
if [[ "$BUILD_MODE" == "release" ]]; then
  codesign --force --options runtime --timestamp --sign "$SIGN_IDENTITY" "$APP_BUNDLE"
else
  codesign --force --deep --sign - "$APP_BUNDLE"
fi

codesign --verify --deep --strict --verbose=2 "$APP_BUNDLE"

if [[ "$BUILD_MODE" == "release" ]]; then
  SIGN_DETAILS="$(codesign -dvvv "$APP_BUNDLE" 2>&1)"
  echo "$SIGN_DETAILS"

  if [[ "$SIGN_DETAILS" != *"Authority=$DEVELOPER_ID_NAME"* ]]; then
    echo "Release blocked: signed app authority is not $DEVELOPER_ID_NAME." >&2
    exit 1
  fi
  if [[ "$SIGN_DETAILS" != *"TeamIdentifier=$TEAM_ID"* ]]; then
    echo "Release blocked: signed app TeamIdentifier is not $TEAM_ID." >&2
    exit 1
  fi
  if [[ "$SIGN_DETAILS" != *"Runtime Version="* && "$SIGN_DETAILS" != *"flags="*"runtime"* ]]; then
    echo "Release blocked: Hardened Runtime is not enabled." >&2
    exit 1
  fi
  if [[ "$SIGN_DETAILS" != *"Timestamp="* ]]; then
    echo "Release blocked: secure timestamp is missing." >&2
    exit 1
  fi
fi

DMG_SOURCE="$BUILD_DIR/dmg-root"
mkdir -p "$DMG_SOURCE"
ditto "$APP_BUNDLE" "$DMG_SOURCE/$APP_NAME.app"
ln -s /Applications "$DMG_SOURCE/Applications"
hdiutil create \
  -volname "$APP_NAME" \
  -srcfolder "$DMG_SOURCE" \
  -ov \
  -format UDZO \
  "$DMG_PATH" >/dev/null

if [[ "$BUILD_MODE" == "release" ]]; then
  codesign --force --timestamp --sign "$SIGN_IDENTITY" "$DMG_PATH"
  codesign --verify --verbose=2 "$DMG_PATH"

  DMG_SIGN_DETAILS="$(codesign -dvvv "$DMG_PATH" 2>&1)"
  echo "$DMG_SIGN_DETAILS"
  if [[ "$DMG_SIGN_DETAILS" != *"Authority=$DEVELOPER_ID_NAME"* ]]; then
    echo "Release blocked: signed DMG authority is not $DEVELOPER_ID_NAME." >&2
    exit 1
  fi
  if [[ "$DMG_SIGN_DETAILS" != *"TeamIdentifier=$TEAM_ID"* ]]; then
    echo "Release blocked: signed DMG TeamIdentifier is not $TEAM_ID." >&2
    exit 1
  fi
  if [[ "$DMG_SIGN_DETAILS" != *"Timestamp="* ]]; then
    echo "Release blocked: signed DMG secure timestamp is missing." >&2
    exit 1
  fi

  NOTARY_RESULT="$BUILD_DIR/notarization-result.json"
  NOTARY_LOG="$BUILD_DIR/notarization-log.json"
  xcrun notarytool submit "$DMG_PATH" \
    --keychain-profile "$NOTARY_PROFILE" \
    --wait \
    --output-format json > "$NOTARY_RESULT"
  cat "$NOTARY_RESULT"

  NOTARY_STATUS="$(plutil -extract status raw -o - "$NOTARY_RESULT")"
  NOTARY_ID="$(plutil -extract id raw -o - "$NOTARY_RESULT")"
  xcrun notarytool log "$NOTARY_ID" \
    --keychain-profile "$NOTARY_PROFILE" \
    "$NOTARY_LOG"

  if [[ "$NOTARY_STATUS" != "Accepted" ]]; then
    echo "Release blocked: Apple notarization status is $NOTARY_STATUS." >&2
    echo "Review: $NOTARY_LOG" >&2
    exit 1
  fi

  xcrun stapler staple "$DMG_PATH"
  xcrun stapler validate "$DMG_PATH"
  hdiutil verify "$DMG_PATH"
  spctl -a -t open --context context:primary-signature -vv "$DMG_PATH"
  codesign --verify --deep --strict --verbose=2 "$APP_BUNDLE"
  spctl -a -t exec -vv "$APP_BUNDLE"
else
  hdiutil verify "$DMG_PATH"
fi

rm -rf "$DMG_SOURCE" "$ICONSET_DIR" "$MODULE_CACHE_DIR" "$BUILD_DIR/PilePilePile-arm64" "$BUILD_DIR/PilePilePile-x86_64"

echo "Build mode: $BUILD_MODE"
echo "$APP_BUNDLE"
echo "$DMG_PATH"
