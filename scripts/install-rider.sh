#!/bin/bash
# Install Claude GUI plugin to Rider for E2E testing
#
# Usage:
#   ./scripts/install-rider.sh              # Auto-detect Rider version
#   ./scripts/install-rider.sh 2024.3       # Specify version
#   RIDER_PLUGINS=/custom/path ./scripts/install-rider.sh
#
# Prerequisites:
#   - Plugin will be built automatically if not present
#   - Rider must be installed

set -e

RIDER_VERSION="${1:-2025.3}"
PLUGIN_NAME="idea-claude-code-gui"

cd "$(dirname "$0")/.."

# Determine Rider plugins directory
if [ -z "$RIDER_PLUGINS" ]; then
    # Try macOS user plugins directory first (preferred for testing)
    USER_PLUGINS="$HOME/Library/Application Support/JetBrains/Rider$RIDER_VERSION/plugins"
    # Then try bundled plugins (requires admin)
    BUNDLED_PLUGINS="/Applications/Rider.app/Contents/plugins"

    if [ -d "$(dirname "$USER_PLUGINS")" ]; then
        RIDER_PLUGINS="$USER_PLUGINS"
        mkdir -p "$RIDER_PLUGINS"
    elif [ -d "$BUNDLED_PLUGINS" ]; then
        RIDER_PLUGINS="$BUNDLED_PLUGINS"
    else
        echo "Error: Could not find Rider installation for version $RIDER_VERSION"
        echo "Try: ./scripts/install-rider.sh <version>"
        echo "Or set RIDER_PLUGINS environment variable"
        exit 1
    fi
fi

echo "=== Claude GUI Plugin Installer ==="
echo "Rider version: $RIDER_VERSION"
echo "Plugins dir: $RIDER_PLUGINS"
echo ""

# Build plugin if not present or force rebuild
PLUGIN_ZIP=$(ls build/distributions/$PLUGIN_NAME-*.zip 2>/dev/null | head -1)
if [ -z "$PLUGIN_ZIP" ] || [ ! -f "$PLUGIN_ZIP" ]; then
    echo "Building plugin..."
    ./gradlew buildPlugin -q
    PLUGIN_ZIP=$(ls build/distributions/$PLUGIN_NAME-*.zip 2>/dev/null | head -1)
fi

if [ -z "$PLUGIN_ZIP" ] || [ ! -f "$PLUGIN_ZIP" ]; then
    echo "Error: Plugin ZIP not found after build"
    exit 1
fi

echo "Plugin: $PLUGIN_ZIP"
echo ""

# Remove old version if exists
if [ -d "$RIDER_PLUGINS/$PLUGIN_NAME" ]; then
    echo "Removing old version..."
    rm -rf "$RIDER_PLUGINS/$PLUGIN_NAME"
fi

# Install new version
echo "Installing plugin..."
unzip -q -o "$PLUGIN_ZIP" -d "$RIDER_PLUGINS/"

echo ""
echo "=== Installation Complete ==="
echo "Restart Rider to load the plugin."
echo ""
echo "To verify:"
echo "  1. Open Rider"
echo "  2. Settings > Plugins > Installed"
echo "  3. Look for 'Claude GUI'"
echo ""
echo "To test E2E:"
echo "  1. Open Claude tool window (View > Tool Windows > Claude)"
echo "  2. Send a test message"
echo "  3. Verify response is received"
