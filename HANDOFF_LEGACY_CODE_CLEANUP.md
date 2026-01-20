# Handoff: Legacy Code Elimination & Architecture Cleanup

## Philosophy

**No quick fixes. No patches. No workarounds.**

This cleanup follows SOLID principles:
- **Single Responsibility**: One code path for message sending, one output format
- **Open/Closed**: Extensible for new features without modifying core message flow
- **Liskov Substitution**: All message types processed uniformly
- **Interface Segregation**: Clean interfaces between Java ↔ Node.js
- **Dependency Inversion**: Depend on abstractions (JSON protocol), not implementations (legacy formats)

---

## Part 1: The Image Attachment Bug

### Problem
Assistant responses don't render when users attach images. Root cause: architectural debt from two parallel implementations that diverged.

### Current Architecture (Broken)

```
                    ┌─────────────────────────────────────────┐
                    │           ClaudeSession.java            │
                    │                                         │
                    │  if (hasAttachments) {                  │
                    │    sendMessage()      ──────────────────┼──┐
                    │  } else {                               │  │
                    │    sendMessageWithBridge() ─────────────┼──┼──┐
                    │  }                                      │  │  │
                    └─────────────────────────────────────────┘  │  │
                                                                 │  │
                    ┌────────────────────────────────────────────┘  │
                    │                                               │
                    ▼                                               ▼
    ┌───────────────────────────────┐       ┌───────────────────────────────┐
    │      sendMessage()            │       │   sendMessageWithBridge()     │
    │                               │       │                               │
    │  Uses: OutputLineProcessor    │       │  Uses: Direct JSON parsing    │
    │  Expects: [MESSAGE]... format │       │  Expects: {type:...} format   │
    │  Calls: bridge.js             │       │  Calls: bridge.js             │
    │                               │       │                               │
    │  ❌ MISMATCH: bridge.js       │       │  ✅ WORKS                     │
    │     outputs JSON, not legacy  │       │                               │
    └───────────────────────────────┘       └───────────────────────────────┘
```

### Target Architecture (Clean)

```
                    ┌─────────────────────────────────────────┐
                    │           ClaudeSession.java            │
                    │                                         │
                    │  // Single path for ALL messages        │
                    │  sendMessage(input, attachments, ...)   │
                    │           │                             │
                    └───────────┼─────────────────────────────┘
                                │
                                ▼
                    ┌───────────────────────────────────────┐
                    │     ClaudeSDKBridge.sendMessage()     │
                    │                                       │
                    │  - Builds JSON command                │
                    │  - Includes attachments if present    │
                    │  - Spawns bridge.js                   │
                    │  - Parses JSON responses              │
                    │  - Calls MessageCallback              │
                    └───────────────────────────────────────┘
                                │
                                ▼
                    ┌───────────────────────────────────────┐
                    │           bridge.js                   │
                    │                                       │
                    │  - Single JSON protocol               │
                    │  - Handles text + attachments         │
                    │  - Outputs {type:...} JSON            │
                    └───────────────────────────────────────┘
```

---

## Part 2: Files to Modify

### 1. `ai-bridge/bridge.js`

**Current state:** Ignores `attachments` field in input.

**Changes needed:**

```javascript
// Line ~350: Add attachments to destructuring
const {
  message,
  sessionId,
  cwd,
  permissionMode = 'default',
  model,
  openedFiles,
  agentPrompt,
  streaming = false,
  attachments  // NEW
} = input;

// Line ~414: Format prompt for Claude SDK
function buildPrompt(message, attachments) {
  if (!attachments || attachments.length === 0) {
    return message;
  }

  // Claude SDK expects content array for multimodal
  const content = [];

  for (const att of attachments) {
    if (att.mediaType?.startsWith('image/')) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: att.mediaType,
          data: att.data
        }
      });
    }
    // Future: handle other attachment types
  }

  // Text goes last
  if (message && message.trim()) {
    content.push({ type: 'text', text: message });
  }

  return content;
}

const prompt = buildPrompt(message, attachments);
const result = query({ prompt, options });
```

### 2. `src/main/java/com/github/claudecodegui/ClaudeSession.java`

**Current state:** Two code paths based on `hasAttachments`.

**Changes needed:**

```java
// DELETE: Lines 449-460 (the branching logic)
// DELETE: The entire sendMessageWithBridge() method (consolidate into sendMessage)

// REWRITE sendMessageToClaude to be single path:
private CompletableFuture<Void> sendMessageToClaude(
    String channelId,
    String input,
    List<Attachment> attachments,
    JsonObject openedFilesJson,
    String externalAgentPrompt
) {
    String agentPrompt = externalAgentPrompt != null ? externalAgentPrompt : getAgentPrompt();

    PermissionService permissionService = PermissionService.getInstance(project);

    ClaudeSDKBridge.PermissionCallback permissionCallback =
        (requestId, toolName, toolInput) ->
            permissionService.requestPermissionDirect(toolName, toolInput);

    ClaudeSDKBridge.AskUserQuestionCallback askUserCallback =
        (requestId, questions) ->
            permissionService.requestAskUserQuestionDirect(questions);

    ClaudeMessageHandler handler = new ClaudeMessageHandler(
        project, state, callbackHandler, messageParser, messageMerger, gson
    );

    Boolean streaming = readStreamingConfig();

    // SINGLE call - handles both with and without attachments
    return claudeSDKBridge.sendMessage(
        channelId,
        input,
        state.getSessionId(),
        state.getCwd(),
        attachments,  // Pass through (can be null or empty)
        state.getPermissionMode(),
        state.getModel(),
        openedFilesJson,
        agentPrompt,
        streaming,
        permissionCallback,
        askUserCallback,
        handler
    ).thenApply(result -> null);
}
```

### 3. `src/main/java/com/github/claudecodegui/provider/claude/ClaudeSDKBridge.java`

**Current state:** Two methods: `sendMessage()` (legacy) and `sendMessageWithBridge()` (new).

**Changes needed:**

```java
// DELETE: The old sendMessage() method (lines 250-505) that uses OutputLineProcessor
// RENAME: sendMessageWithBridge() → sendMessage()
// ADD: attachments parameter to the renamed method

public CompletableFuture<SDKResult> sendMessage(
    String channelId,
    String message,
    String sessionId,
    String cwd,
    List<ClaudeSession.Attachment> attachments,  // NEW PARAMETER
    String permissionMode,
    String model,
    JsonObject openedFiles,
    String agentPrompt,
    Boolean streaming,
    PermissionCallback permissionCallback,
    AskUserQuestionCallback askUserCallback,
    MessageCallback callback
) {
    return CompletableFuture.supplyAsync(() -> {
        // ... existing setup code ...

        // Build command JSON - ADD attachments
        JsonObject commandJson = new JsonObject();
        commandJson.addProperty("message", message);
        commandJson.addProperty("sessionId", sessionId != null ? sessionId : "");
        commandJson.addProperty("cwd", cwd != null ? cwd : "");
        commandJson.addProperty("permissionMode", permissionMode != null ? permissionMode : "default");
        // ... other fields ...

        // NEW: Add attachments to command
        if (attachments != null && !attachments.isEmpty()) {
            JsonArray attArray = new JsonArray();
            for (ClaudeSession.Attachment att : attachments) {
                JsonObject attObj = new JsonObject();
                attObj.addProperty("fileName", att.fileName);
                attObj.addProperty("mediaType", att.mediaType);
                attObj.addProperty("data", att.data);
                attArray.add(attObj);
            }
            commandJson.add("attachments", attArray);
        }

        // ... rest of implementation (JSON parsing, not OutputLineProcessor) ...
    });
}
```

### 4. `src/main/java/com/github/claudecodegui/provider/claude/OutputLineProcessor.java`

**Action:** Evaluate for deletion or repurposing.

After the refactor, check if any code still uses this class. If not, delete it entirely.

If it's still needed for other operations (rewind, MCP status, etc.), keep it but ensure those operations actually use the legacy format.

---

## Part 3: Legacy Code Audit

### Files Referencing `channel-manager.js`

| File | Line | Status | Action |
|------|------|--------|--------|
| `RewindOperations.java` | 28 | Uses legacy script | Investigate if script exists |
| `McpStatusClient.java` | 27 | Uses legacy script | Investigate if script exists |
| `SlashCommandClient.java` | 27 | Uses legacy script | Investigate if script exists |
| `SessionOperations.java` | 24 | Uses legacy script | Investigate if script exists |

**Critical question:** Does `channel-manager.js` exist in `ai-bridge/`?

```bash
ls -la ai-bridge/channel-manager.js
```

If it doesn't exist, these classes are **broken**. They need to either:
1. Be deleted if unused
2. Be migrated to use `bridge.js` with appropriate commands

### Legacy Format Analysis

**OutputLineProcessor expects these formats:**
- `[MESSAGE]...`
- `[CONTENT]...`
- `[CONTENT_DELTA]...`
- `[THINKING]...`
- `[STREAM_START]`
- `[STREAM_END]`
- `[SESSION_ID]...`
- `[TOOL_RESULT]...`
- `[SEND_ERROR]...`

**Question to answer:** Does ANY current code produce these formats?

Search:
```bash
grep -rn "\[MESSAGE\]\|\[CONTENT\]\|\[STREAM_" ai-bridge/
```

If nothing produces them, `OutputLineProcessor` is dead code.

### Classes to Audit for Dead Code

1. **OutputLineProcessor.java** - Likely dead after refactor
2. **BaseSDKBridge.java** - Check if abstract methods are still needed
3. **ProcessManager.java** - Verify all methods are called
4. **EnvConfigurator.java** - Verify all methods are called

### Unused Dependencies

Check `ai-bridge/package.json` for:
- Dependencies that are imported but never used
- DevDependencies that could be pruned

---

## Part 4: Implementation Order

### Phase 1: Fix the Bug (Single Code Path)

1. Update `bridge.js` to handle attachments
2. Consolidate `ClaudeSDKBridge` to single `sendMessage()` method
3. Update `ClaudeSession` to use single path
4. Run E2E test: `node tests/e2e/test-image-attachment.mjs`
5. Run full test suite

### Phase 2: Remove Dead Code

1. Delete old `sendMessage()` implementation in ClaudeSDKBridge
2. Evaluate `OutputLineProcessor` - delete if unused
3. Audit `channel-manager.js` references
4. Remove any truly dead code found

### Phase 3: Verify Other Operations

1. Test rewind functionality
2. Test MCP status
3. Test slash commands
4. Test session operations
5. Fix any that break due to removed legacy code

---

## Part 5: Testing Strategy

### Unit Tests
```bash
npm test --prefix ai-bridge
npm test --prefix webview
./gradlew test
```

### E2E Tests
```bash
# Image attachment (the bug)
node tests/e2e/test-image-attachment.mjs

# Full suite
node tests/e2e/run-all.mjs
```

### Manual Testing Checklist

- [ ] Send text-only message → Response renders
- [ ] Send message with 1 image → Response renders, describes image
- [ ] Send message with multiple images → Response renders
- [ ] Send message with image + text → Both processed correctly
- [ ] Interrupt generation → Stops cleanly
- [ ] Session rewind → Works correctly
- [ ] Slash commands → Work correctly
- [ ] Permission dialogs → Appear and function

---

## Success Criteria

1. **Zero dual code paths** for message sending
2. **Zero OutputLineProcessor usage** for bridge.js output (or class deleted)
3. **Zero references** to non-existent scripts
4. **All tests pass** (unit, integration, E2E)
5. **Image attachments work** in E2E test
6. **Code follows single responsibility** - each class has one job
7. **No legacy format strings** in new code paths

---

## Part 6: Additional Legacy Issues Found (Full Audit)

### Issue Summary Table

| # | Issue | File | Lines | Risk | Action |
|---|-------|------|-------|------|--------|
| 1 | Dead sendMessage() path | ClaudeSession.java | 449-505 | HIGH | Remove unreachable legacy branch |
| 2 | Missing channel-manager.js | ClaudeChatWindow.java | 189-190 | HIGH | Delete broken check |
| 3 | Unused abstract method | BaseSDKBridge.java | 44-51 | MEDIUM | Remove processOutputLine() |
| 4 | Unused launchChannel() | BaseSDKBridge.java | 73-82 | MEDIUM | Remove method |
| 5 | Broken bridge path check | ClaudeChatWindow.java | 184-199 | LOW | Fix or remove |
| 6 | Duplicate constants | BaseSDKBridge/ClaudeSDKBridge | 24, 561 | LOW | Consolidate BRIDGE_SCRIPT |

---

### Issue 1: Dead sendMessage() Path (HIGH)

**Location:** `ClaudeSession.java` lines 449-505

**Problem:** The branching logic uses `shouldUseNewBridge()` which always returns `true`:

```java
boolean useNewBridge = !hasAttachments && shouldUseNewBridge();
// shouldUseNewBridge() always returns true (line 515)
// So: useNewBridge = !hasAttachments && true = !hasAttachments

if (useNewBridge) {
    return sendMessageWithBridge(...);  // Called when NO attachments
}
// Legacy path - ONLY called when hasAttachments == true
return claudeSDKBridge.sendMessage(...);  // Uses OutputLineProcessor - BROKEN!
```

**This is the ROOT CAUSE of the image attachment bug.** The legacy path IS reached for attachments, but it uses `OutputLineProcessor` which expects `[MESSAGE]...` format while `bridge.js` outputs JSON.

**Action:** Delete entire legacy branch, make `sendMessageWithBridge()` handle attachments.

---

### Issue 2: Missing channel-manager.js Reference (HIGH)

**Location:** `ClaudeChatWindow.java` lines 184-199

```java
private void overrideBridgePathIfAvailable() {
    File channelManager = new File(bridgeDir, "channel-manager.js");  // DOESN'T EXIST
    if (bridgeDir.exists() && channelManager.exists()) {  // Always false
        claudeSDKBridge.setSdkTestDir(bridgeDir.getAbsolutePath());
    }
}
```

**Problem:** `channel-manager.js` was replaced by `bridge.js`. This check never succeeds.

**Action:** Either fix to check for `bridge.js` or delete the method entirely.

---

### Issue 3: Unused Abstract Method (MEDIUM)

**Location:** `BaseSDKBridge.java` lines 44-51, `ClaudeSDKBridge.java` lines 92-113

```java
// BaseSDKBridge.java - Abstract method defined
protected abstract void processOutputLine(...);

// ClaudeSDKBridge.java - Override exists but NEVER CALLED
@Override
protected void processOutputLine(...) {
    // Delegates to OutputLineProcessor
}
```

**Problem:** This method is overridden but never invoked. `BaseSDKBridge.executeStreamingCommand()` (the only caller) is also never called.

**Action:** Delete the abstract method and its override.

---

### Issue 4: Unused launchChannel() Method (MEDIUM)

**Location:** `BaseSDKBridge.java` lines 73-82

```java
public JsonObject launchChannel(String channelId, String sessionId, String cwd) {
    JsonObject result = new JsonObject();
    result.addProperty("success", true);
    return result;  // Return value is ignored by caller
}
```

**Problem:** Called in `ClaudeSession.java` but return value is discarded. Vestige of old channel architecture.

**Action:** Delete the method and its call site.

---

### Issue 5: Broken Bridge Path Override (LOW)

**Location:** `ClaudeChatWindow.java` lines 184-199

**Problem:** Intended to support local ai-bridge development, but checks for wrong file.

**Action:** Fix to check `bridge.js` or remove if feature not needed.

---

### Issue 6: Duplicate Script Constants (LOW)

**Locations:**
- `BaseSDKBridge.java` line 24: `CHANNEL_SCRIPT = "bridge.js"`
- `ClaudeSDKBridge.java` line 561: `BRIDGE_SCRIPT = "bridge.js"`

**Problem:** Same value, different names. Confusing.

**Action:** Consolidate to single `BRIDGE_SCRIPT` constant in `BaseSDKBridge`.

---

## Part 7: Complete Cleanup Checklist

### Phase 1: Fix Image Bug (Blocking)
- [ ] Add `attachments` extraction to `bridge.js`
- [ ] Add `buildPrompt()` function for multimodal messages
- [ ] Update `sendMessageWithBridge()` to accept attachments parameter
- [ ] Update `ClaudeSession.sendMessageToClaude()` to use single path
- [ ] Delete legacy `sendMessage()` branch
- [ ] Test: `node tests/e2e/test-image-attachment.mjs`

### Phase 2: Remove Dead Code
- [ ] Delete `OutputLineProcessor.java` (verify no callers first)
- [ ] Delete `BaseSDKBridge.processOutputLine()` abstract method
- [ ] Delete `ClaudeSDKBridge.processOutputLine()` override
- [ ] Delete `BaseSDKBridge.launchChannel()` method
- [ ] Delete `ClaudeSession` call to `launchChannel()`
- [ ] Delete old `sendMessage()` methods in `ClaudeSDKBridge` (lines 218-505)

### Phase 3: Clean Up References
- [ ] Fix or delete `ClaudeChatWindow.overrideBridgePathIfAvailable()`
- [ ] Rename `CHANNEL_SCRIPT` to `BRIDGE_SCRIPT` in `BaseSDKBridge`
- [ ] Delete duplicate `BRIDGE_SCRIPT` constant in `ClaudeSDKBridge`
- [ ] Remove all "channel-manager.js" string references
- [ ] Remove "legacy" comments that no longer apply

### Phase 4: Final Verification
- [ ] Run full test suite: `./scripts/test-all.sh`
- [ ] Manual testing checklist (see Part 5)
- [ ] Code review for any remaining legacy patterns
- [ ] Update CLAUDE.md if architecture changed significantly
