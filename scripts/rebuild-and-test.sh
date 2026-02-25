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

# Java 21 required for build (not the system default)
export JAVA_HOME=/opt/homebrew/Cellar/openjdk@21/21.0.10/libexec/openjdk.jdk/Contents/Home

RIDER_CONFIG_DIR=~/Library/Application\ Support/JetBrains/Rider2025.3
PLUGIN_DIR="$RIDER_CONFIG_DIR"/plugins/idea-claude-gui
OPEN_GUI=true

# Parse args
for arg in "$@"; do
  case $arg in
    --no-open-gui)
      OPEN_GUI=false
      ;;
  esac
done

# Find last opened project from Rider's recentSolutions.xml to bypass welcome screen
RECENT_FILE="$RIDER_CONFIG_DIR/options/recentSolutions.xml"
LAST_PROJECT=""
if [ -f "$RECENT_FILE" ]; then
  # Find the entry with opened="true" or the highest activationTimestamp
  LAST_PROJECT=$(grep -B1 'opened="true"' "$RECENT_FILE" 2>/dev/null | grep 'entry key=' | head -1 | sed 's/.*key="\([^"]*\)".*/\1/' | sed "s|\\\$USER_HOME\\\$|$HOME|g")
  if [ -z "$LAST_PROJECT" ]; then
    # Fallback: pick the most recently activated project
    LAST_PROJECT=$(python3 -c "
import xml.etree.ElementTree as ET, os
tree = ET.parse(os.path.expanduser('$RECENT_FILE'))
best_ts, best_key = 0, ''
for entry in tree.iter('entry'):
    key = entry.get('key', '')
    for meta in entry.iter('RecentProjectMetaInfo'):
        for opt in meta.iter('option'):
            if opt.get('name') == 'activationTimestamp':
                ts = int(opt.get('value', '0'))
                if ts > best_ts:
                    best_ts, best_key = ts, key
print(best_key.replace('\$USER_HOME\$', os.path.expanduser('~')))
" 2>/dev/null)
  fi
fi

echo "🔨 Building plugin..."
./gradlew clean buildPlugin

echo "📦 Installing plugin..."
rm -rf "$PLUGIN_DIR"
unzip -o build/distributions/idea-claude-gui-*.zip -d ~/Library/Application\ Support/JetBrains/Rider2025.3/plugins/

echo "🔄 Restarting Rider..."
pkill -f "Rider.app" || true
sleep 2

if [ -n "$LAST_PROJECT" ] && [ -e "$LAST_PROJECT" ]; then
  echo "   Opening project: $LAST_PROJECT"
  open -a Rider "$LAST_PROJECT"
else
  echo "   ⚠️  No recent project found, opening Rider without project (may show welcome screen)"
  open -a Rider
fi

echo "⏳ Waiting for Rider to start (20s)..."
sleep 20

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
