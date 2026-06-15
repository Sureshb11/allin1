#!/bin/bash

# Clean macOS resource fork files script
# This script removes all ._* files that interfere with Gradle builds on external drives

echo "🧹 Cleaning macOS resource fork files..."

# Remove all ._* files recursively
find . -type f -name "._*" -delete 2>/dev/null || true

# Remove .DS_Store files
find . -name ".DS_Store" -delete 2>/dev/null || true

# Clean specific problematic directories
rm -rf android/.gradle 2>/dev/null || true
rm -rf android/app/build 2>/dev/null || true
rm -rf android/build 2>/dev/null || true
rm -rf node_modules/@react-native/gradle-plugin/*/build 2>/dev/null || true

echo "✅ Cleanup completed!"
echo "💡 You can now try running: npx react-native run-android"
