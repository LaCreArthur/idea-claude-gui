# E2E Testing Efficiency Learnings

Lessons learned from AI-driven E2E testing sessions. **Read this BEFORE starting any E2E work.**

**Last Updated:** 2026-01-16

---

## 🚨 PRE-FLIGHT CHECKLIST (Run Before Every Session)

```bash
# 1. Verify Rider is running and CDP is available
curl -s http://localhost:9222/json/version | head -1 || echo "❌ CDP not available - open Claude GUI panel in Rider"

# 2. Check plugin is installed
ls ~/Library/Application\ Support/JetBrains/Rider2025.3/plugins/idea-claude-gui/ > /dev/null && echo "✅ Plugin installed" || echo "❌ Plugin not installed"

# 3. Verify current mode (should be Default for most tests)
# Run: node tests/e2e/check-bridge-debug.mjs
```

**If CDP fails:** Open Claude GUI panel in Rider (Cmd+Shift+A → "Claude GUI")

---

## 🔄 THE BUILD-TEST CYCLE

### After ANY Code Change:

```bash
# Step 1: Rebuild (REQUIRED after Java, Bridge, or Resource changes)
./gradlew clean buildPlugin

# Step 2: Reinstall plugin
rm -rf ~/Library/Application\ Support/JetBrains/Rider2025.3/plugins/idea-claude-gui
unzip -o build/distributions/idea-claude-gui-*.zip -d ~/Library/Application\ Support/JetBrains/Rider2025.3/plugins/

# Step 3: Restart Rider
pkill -f "Rider.app" && sleep 2 && open -a Rider

# Step 4: Wait and open Claude GUI (after Rider starts)
sleep 12 && osascript -e 'tell application "Rider" to activate' -e 'tell application "System Events" to keystroke "a" using {command down, shift down}' && sleep 1 && osascript -e 'tell application "System Events" to keystroke "Claude GUI"' -e 'tell application "System Events" to keystroke return'
```

### Quick Rebuild Script (save as `scripts/rebuild-and-test.sh`):
```bash
#!/bin/bash
set -e
echo "🔨 Building plugin..."
./gradlew clean buildPlugin

echo "📦 Installing plugin..."
rm -rf ~/Library/Application\ Support/JetBrains/Rider2025.3/plugins/idea-claude-gui
unzip -o build/distributions/idea-claude-gui-*.zip -d ~/Library/Application\ Support/JetBrains/Rider2025.3/plugins/

echo "🔄 Restarting Rider..."
pkill -f "Rider.app" || true
sleep 2
open -a Rider

echo "⏳ Waiting for Rider to start (15s)..."
sleep 15

echo "🖥️ Opening Claude GUI..."
osascript -e 'tell application "Rider" to activate'
sleep 1
osascript -e 'tell application "System Events" to keystroke "a" using {command down, shift down}'
sleep 1
osascript -e 'tell application "System Events" to keystroke "Claude GUI"'
sleep 0.5
osascript -e 'tell application "System Events" to keystroke return'

echo "✅ Ready! Run your E2E test now."
```

---

## ⚡ EFFICIENCY RULES

### Rule 1: NEVER Skip the Rebuild
**Cost of forgetting:** 10-30 minutes debugging the wrong code
**Solution:** Always rebuild after touching Java/Bridge/Resource files

### Rule 2: Use Automation
**Don't:** Manually restart Rider, manually open Claude GUI, manually check CDP
**Do:** Use scripts, use AppleScript for UI automation

### Rule 3: Start Fresh Sessions for Tests
**Problem:** Claude resumes context and answers from memory
**Solution:** Always click "New Session" before sending test commands

### Rule 4: Use Commands NOT in Allow List
**Problem:** SDK auto-approves commands in `.claude/settings.local.json`
**Solution:** Use `curl`, `wget`, or other non-allowed commands to trigger permission dialogs

### Rule 5: Check Logs Early
**Problem:** Spent time debugging UI when the issue was in the backend
**Solution:** Check these immediately:
```bash
# Rider logs (Java side)
tail -50 ~/Library/Logs/JetBrains/Rider2025.3/idea.log | grep -E "(permission|Permission|Bridge|Error)"

# Webview test log (JS side)
node tests/e2e/check-bridge-debug.mjs
```

---

## 🔍 DEBUGGING DECISION TREE

```
Test failing?
    │
    ├─► Is CDP responding?
    │   curl -s http://localhost:9222/json/version
    │   NO → Open Claude GUI panel in Rider
    │
    ├─► Did you rebuild after code changes?
    │   NO → ./gradlew clean buildPlugin && restart Rider
    │
    ├─► Is the correct code deployed?
    │   Check: grep "YOUR_CHANGE" ~/Library/.../plugins/idea-claude-gui/ai-bridge/bridge.js
    │   NO → Reinstall plugin and restart Rider
    │
    ├─► Is permission dialog expected?
    │   Check: Is command in .claude/settings.local.json allow list?
    │   YES → Use a different command (curl, wget)
    │
    ├─► Is Claude responding at all?
    │   Check Rider logs for errors
    │   NO → Check authentication, SDK installation
    │
    └─► Check window.__testMessageLog for communication issues
```

---

## 📋 COMPONENT SELECTORS (Quick Reference)

| Component | Selector | Notes |
|-----------|----------|-------|
| Chat Input | `.input-editable` | Use `innerText` not `value` |
| Submit Button | `.submit-button` | |
| Mode Selector | `.selector-button` (find by text) | Multiple exist, match by keyword |
| Mode Options | `.selector-option` | |
| Permission Dialog | `.permission-dialog-v3` | |
| Permission Options | `.permission-dialog-v3-option` | Index: 0=Allow, 1=Always, 2=Deny |
| AskUser Dialog | `.ask-user-question-dialog` | |
| AskUser Options | `button.question-option` | |
| Plan Dialog | `.plan-approval-dialog` | SDK doesn't trigger this yet |
| New Session | `.icon-button[data-tooltip="New Session"]` | |
| Messages | `.message.assistant`, `.message.user` | |

---

## 🐛 BUGS FOUND & PATTERNS

### Pattern: Default Values Wrong
**Symptom:** Feature doesn't work even though code looks correct
**Cause:** React state initialized with wrong default
**Debug:** Check `useState()` calls, check persistent settings
**Example:** Permission mode defaulted to `bypassPermissions` instead of `default`

### Pattern: Persistent Settings Override
**Symptom:** Fix doesn't take effect after restart
**Cause:** Old value saved in PropertiesComponent/localStorage
**Debug:** Check what's being restored on startup
**Fix:** Clear via UI or find storage location

### Pattern: SDK Bypasses Callback
**Symptom:** Callback never called even though it should be
**Cause:** SDK has its own allow rules that run first
**Debug:** Check `.claude/settings.local.json` for matching rules
**Fix:** Use commands not in the allow list

---

## 🧪 TEST PATTERNS

### Pattern: Force Tool Execution
```javascript
// BAD: Claude may answer from context
const message = 'list files in the current directory';

// GOOD: Requires actual execution
const message = 'Run this exact bash command: curl -s https://httpbin.org/uuid';
```

### Pattern: Reliable Mode Switching
```javascript
async function switchToMode(page, modeName) {
  // 1. Find mode button by text content
  await page.evaluate(() => {
    const keywords = ['Auto-accept', 'Default', 'Plan', 'Accept Edits'];
    for (const btn of document.querySelectorAll('.selector-button')) {
      if (keywords.some(k => btn.textContent?.includes(k))) {
        btn.click();
        return;
      }
    }
  });
  await sleep(300);

  // 2. Click target mode
  await page.evaluate((target) => {
    for (const opt of document.querySelectorAll('.selector-option')) {
      if (opt.textContent?.includes(target)) {
        opt.click();
        return;
      }
    }
  }, modeName);
}
```

### Pattern: Wait for Claude to Finish
```javascript
async function waitForGenerationComplete(page, timeout = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const isGenerating = await page.evaluate(() =>
      document.body.innerText?.includes('Generating')
    );
    if (!isGenerating) return true;
    await sleep(1000);
  }
  return false;
}
```

---

## 📁 KEY FILE LOCATIONS

| What | Path |
|------|------|
| Plugin install dir | `~/Library/Application Support/JetBrains/Rider2025.3/plugins/idea-claude-gui/` |
| Rider logs | `~/Library/Logs/JetBrains/Rider2025.3/idea.log` |
| Claude settings | `~/.claude/settings.json` |
| Project allow rules | `.claude/settings.local.json` |
| Built plugin | `build/distributions/idea-claude-gui-*.zip` |
| Bridge source | `ai-bridge/bridge.js` |
| React source | `webview/src/App.tsx` |

---

## ✅ SESSION END CHECKLIST

Before ending an E2E session:
1. [ ] All tests passing?
2. [ ] Documentation updated with new learnings?
3. [ ] Any new bugs documented?
4. [ ] Test files cleaned up (no debug code left)?
5. [ ] Mode set back to Default?
