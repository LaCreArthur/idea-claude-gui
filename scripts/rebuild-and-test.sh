#!/bin/bash
# Rebuild plugin and restart Rider for E2E testing
#
# Usage: ./scripts/rebuild-and-test.sh [--no-open-gui]
#
# This script:
# 1. Builds the plugin with Gradle
# 2. Installs it to Rider's plugins directory
# 3. Restarts Rider
# 4. Opens the Claude GUI panel (unless --no-open-gui)

set -e

PLUGIN_DIR=~/Library/Application\ Support/JetBrains/Rider2025.3/plugins/idea-claude-gui
OPEN_GUI=true

# Parse args
for arg in "$@"; do
  case $arg in
    --no-open-gui)
      OPEN_GUI=false
      ;;
  esac
done

echo "🔨 Building plugin..."
./gradlew clean buildPlugin

echo "📦 Installing plugin..."
rm -rf "$PLUGIN_DIR"
unzip -o build/distributions/idea-claude-gui-*.zip -d ~/Library/Application\ Support/JetBrains/Rider2025.3/plugins/

echo "🔄 Restarting Rider..."
pkill -f "Rider.app" || true
sleep 2
open -a Rider

echo "⏳ Waiting for Rider to start (15s)..."
sleep 15

if [ "$OPEN_GUI" = true ]; then
  echo "🖥️ Opening Claude GUI..."
  osascript -e 'tell application "Rider" to activate'
  sleep 1
  osascript -e 'tell application "System Events" to keystroke "a" using {command down, shift down}'
  sleep 1
  osascript -e 'tell application "System Events" to keystroke "Claude GUI"'
  sleep 0.5
  osascript -e 'tell application "System Events" to keystroke return'

  echo "⏳ Waiting for GUI to initialize (5s)..."
  sleep 5
fi

echo "✅ Ready! Run your E2E test now."
echo ""
echo "Quick verification:"
echo "  curl -s http://localhost:9222/json/version | head -1"
