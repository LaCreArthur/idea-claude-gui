#!/bin/bash
# Opens Claude GUI panel in Rider via AppleScript menu navigation
# Key learnings:
#   - Cmd+Shift+A action search is unreliable via AppleScript
#   - View > Tool Windows > Claude GUI menu path works reliably
#   - Process name is lowercase "rider" not "Rider"

set -e

echo "Opening Claude GUI panel in Rider..."

# Activate Rider
osascript -e 'tell application "Rider" to activate'
sleep 0.5

# Open via View menu (most reliable method)
osascript <<'EOF'
tell application "System Events"
    tell process "rider"
        click menu item "Tool Windows" of menu "View" of menu bar 1
        delay 0.3
        click menu item "Claude GUI" of menu 1 of menu item "Tool Windows" of menu "View" of menu bar 1
    end tell
end tell
EOF

echo "Waiting for webview to initialize..."
sleep 2

# Verify CDP is accessible and webview is loaded
for i in {1..10}; do
    if curl -s http://localhost:9222/json/list 2>/dev/null | grep -q "Claude"; then
        echo "Claude GUI webview is ready"
        exit 0
    fi
    echo "  Waiting... ($i/10)"
    sleep 1
done

echo "Warning: Could not verify Claude GUI webview via CDP"
exit 1
