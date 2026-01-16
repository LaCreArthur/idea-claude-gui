# AI Automation Learnings

Hard-won lessons from attempting AI-driven E2E testing with computer control.

## Problem: Clicking on Wrong Elements

### What Happened
- Tried to click on Claude GUI input field
- Kept clicking on Rider's Git panel, search boxes, file trees instead
- Coordinate-based clicking is unreliable

### Why It Failed
1. **Screen layout assumptions are wrong** - Claude GUI panel was in CENTER, not LEFT
2. **JCEF webviews may not receive clicks normally** - Embedded browser components
3. **Popups and overlays intercept clicks** - Search dialogs appeared instead
4. **Coordinate math is error-prone** - Estimating pixel positions from screenshots

### What Works Better
1. **Use keyboard navigation** - `Cmd+Shift+A` → search for "Claude GUI" → Enter
2. **Use application's own shortcuts** - Find tool window focus shortcuts
3. **Click then verify with screenshot** - Always check what actually happened
4. **Escape first** - Clear any popups before clicking

## Correct cliclick Syntax

```bash
# Click at coordinates
cliclick c:400,300

# Type text
cliclick t:"Hello World"

# Press special keys
cliclick kp:enter
cliclick kp:esc
cliclick kp:tab
cliclick kp:space
cliclick kp:delete

# Arrow keys
cliclick kp:arrow-up
cliclick kp:arrow-down
cliclick kp:arrow-left
cliclick kp:arrow-right

# Modifier keys (hold down, type, release)
cliclick kd:cmd t:a ku:cmd           # Cmd+A (select all)
cliclick kd:cmd,shift t:a ku:cmd,shift  # Cmd+Shift+A (Rider: Find Action)

# Double click
cliclick dc:400,300

# Right click
cliclick rc:400,300
```

## Rider-Specific Navigation

### Opening Tool Windows
```bash
# Open Find Action dialog
cliclick kd:cmd,shift t:a ku:cmd,shift
sleep 1
cliclick t:"Claude GUI"
sleep 0.5
cliclick kp:enter
```

### Common Rider Shortcuts
- `Cmd+Shift+A` - Find Action (search for anything)
- `Cmd+1` - Project tool window
- `Cmd+9` - Git tool window
- `Cmd+E` - Recent files
- `Escape` - Close current popup/dialog

## Screenshot Analysis Tips

### Identifying UI Elements
1. Look for **text labels** to identify panels
2. Note **panel borders** and **dividers**
3. Watch for **dark/light theme** affecting visibility
4. Check if element is **floating** vs **docked**

### Common Misidentification
| What I thought | What it actually was |
|---------------|---------------------|
| Claude GUI panel (left) | Rider's Changes/Git panel |
| Input field | Search box |
| Center panel | Floating overlay |

## Best Practices

### Before Clicking
1. Take screenshot
2. Identify ALL visible panels
3. Note exact pixel boundaries
4. Check for overlays/popups

### After Clicking
1. Take screenshot
2. Verify intended element was activated
3. Check for unintended popups
4. Escape if wrong element

### Reliable Patterns
```bash
# Pattern: Clear state → Navigate → Verify
cliclick kp:esc                    # Clear any popups
sleep 0.3
cliclick kd:cmd,shift t:a ku:cmd,shift  # Open Find Action
sleep 1
cliclick t:"Target Action"         # Search
sleep 0.5
cliclick kp:enter                  # Select
sleep 0.5
screencapture -x /tmp/verify.png   # Verify
```

## When to Use What

| Task | Approach |
|------|----------|
| Open tool window | Keyboard: Find Action → search → Enter |
| Click specific button | Coordinates (with verification) |
| Type in focused field | `cliclick t:"text"` |
| Navigate menus | Keyboard shortcuts |
| Dismiss popups | `cliclick kp:esc` |

## Future Improvements

1. **Use accessibility APIs** - Query element positions programmatically
2. **Use Rider's remote API** - JetBrains Gateway or similar
3. **Record and replay** - Capture known-good coordinates
4. **Visual diffing** - Compare screenshots to detect changes

## Key Lesson

> **Keyboard navigation is more reliable than mouse clicks for IDE automation.**
>
> Use `Cmd+Shift+A` (Find Action) to navigate to any feature by name,
> rather than trying to click on pixel coordinates.

---

## JCEF Webview Limitations (Critical Finding)

**Date:** 2026-01-16

### Problem
The Claude GUI plugin uses JCEF (Java Chromium Embedded Framework) to render a React webview.
Standard automation tools cannot interact with JCEF webview content.

### What DOESN'T Work

| Method | Result |
|--------|--------|
| `cliclick t:"text"` | Text not entered |
| `osascript keystroke` | Text not entered |
| Clipboard paste (Cmd+V) | Text not entered |
| `cliclick kp:return` | Message not sent |
| Click coordinates on webview | Inconsistent/fails |

### Why It Fails
1. JCEF webview has its own event handling
2. System-level keyboard events don't reach the embedded browser
3. Click events may hit the webview container but not the actual DOM elements

### Potential Solutions (Untested)
1. **JavaScript injection** - Use JCEF's `executeJavaScript()` API
2. **Plugin internal API** - Call Java methods directly
3. **Chrome DevTools Protocol** - If JCEF exposes CDP
4. **Accessibility APIs** - macOS accessibility might work differently
5. **Focus handling** - Ensure webview has proper focus first

### Implication for E2E Testing
Direct UI automation of JCEF webviews requires either:
- Modifying the plugin to expose test hooks
- Using browser automation protocols (Playwright/Puppeteer-like)
- Testing at the API level instead of UI level
