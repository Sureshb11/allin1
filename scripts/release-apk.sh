#!/usr/bin/env bash
# release-apk.sh — standard Local Legends APK release flow.
# Builds the signed release APK, copies it to the repo root as LocalLegends.apk,
# and archives a stamped, never-overwritten copy under releases/.
#
#   ./scripts/release-apk.sh            # build, copy, archive
#   ./scripts/release-apk.sh --no-build # skip gradle; just copy+archive the last build
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APK="$ROOT/frontend/android/app/build/outputs/apk/release/app-release.apk"

if [[ "${1:-}" != "--no-build" ]]; then
  echo "▸ Building release APK…"
  ( cd "$ROOT/frontend/android" && ./gradlew assembleRelease )
fi
[[ -f "$APK" ]] || { echo "✗ APK not found: $APK"; exit 1; }

# Copy to repo root (convenience copy — overwritten each build).
cp "$APK" "$ROOT/LocalLegends.apk"

# Archive a stamped copy: LocalLegends_v<ver>_<YYYY-MM-DD>_<shortsha>.apk
SDK="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
AAPT="$(ls "$SDK/build-tools/"*/aapt 2>/dev/null | sort | tail -1 || true)"
VER="$([[ -n "$AAPT" ]] && "$AAPT" dump badging "$APK" 2>/dev/null | sed -n "s/.*versionName='\([^']*\)'.*/\1/p" || echo 1.0.0)"
VER="${VER:-1.0.0}"
SHORTSHA="$(cd "$ROOT" && git rev-parse --short HEAD 2>/dev/null || echo nogit)"
DATE="$(date +%Y-%m-%d)"
mkdir -p "$ROOT/releases"
STAMPED="$ROOT/releases/LocalLegends_v${VER}_${DATE}_${SHORTSHA}.apk"
cp "$APK" "$STAMPED"

echo "✓ Root copy : $ROOT/LocalLegends.apk"
echo "✓ Archived  : $STAMPED"
echo "  size      : $(stat -f%z "$STAMPED" 2>/dev/null || stat -c%s "$STAMPED") bytes"
echo "  sha256    : $(shasum -a 256 "$STAMPED" | awk '{print $1}')"
