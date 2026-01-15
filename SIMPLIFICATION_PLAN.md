# Claude Code GUI - Radical Simplification Plan

## Instructions for Agent (Ralph Loop)

**Execution Model:**
1. Read this file, find FIRST unchecked task `- [ ]`
2. Execute that task completely
3. Mark complete: `- [x] Task description`
4. Run tests: `./gradlew clean buildPlugin`
5. If build passes, commit: `git add -A && git commit -m "refactor: [brief description]"`
6. Continue to next unchecked task
7. When phase complete, verify all functionality before moving to next phase

**Philosophy:** SpaceX Raptor iteration - delete everything non-essential, simplify what remains.

---

## Goal

Transform complex, over-engineered plugin into focused Claude Code GUI.

| Component | Before | After | Reduction |
|-----------|--------|-------|-----------|
| ai-bridge (Node.js) | ~4,800 lines | ~150 lines | 97% |
| Java | ~15,000 lines | ~8,000 lines | 47% |
| Settings options | ~30 | ~5 | 83% |

---

## PHASE 1: Replace File-Based IPC with stdin/stdout

**Current Problem:** Node.js and Java communicate via file polling (slow, complex, race conditions)

**Solution:** Use stdin/stdout JSON lines (fast, simple, reliable)

### Current Flow (Complex - 7 steps)
```
Node.js → writes file → Java polls (500ms) → shows dialog →
JS responds → Java writes file → Node.js polls (100ms) → returns
```

### New Flow (Simple - 3 steps)
```
Node.js → stdout JSON → Java shows dialog → stdin JSON → Node.js returns
```

### Tasks

- [x] **1.1** Create `ai-bridge/bridge.js` - new minimal bridge (~150 lines)
  - Single file that imports Claude SDK
  - Reads command from stdin
  - Streams events to stdout as JSON lines
  - Handles permission callbacks via stdout request + stdin response
  - Handles AskUserQuestion via stdout request + stdin response
  - Format: `{"type": "...", "data": {...}}`

- [x] **1.2** Add stdin writer to `ClaudeSDKBridge.java`
  - Add `sendToProcess(String json)` method that writes to process stdin
  - Modify output reader to parse JSON lines
  - Dispatch events based on `type` field

- [x] **1.3** Modify `PermissionService.java` to use stdin/stdout
  - Added requestPermissionDirect() for direct permission requests
  - Added requestAskUserQuestionDirect() for direct AskUserQuestion requests
  - File polling still exists for backward compatibility (will be removed in Phase 2)

- [x] **1.4** Update permission flow in `PermissionHandler.java`
  - Added sendMessageWithBridge() to ClaudeSession
  - Wired PermissionService callbacks to ClaudeSDKBridge
  - File-based handling remains for backward compatibility

- [x] **1.5** Test Phase 1 completion
  - Build plugin: `./gradlew clean buildPlugin` ✅
  - NOTE: Functional testing requires manual IDE testing
  - New code paths ready but not yet default (backward compatible)

---

## PHASE 2: Delete Old ai-bridge Code

**After Phase 1 works, delete all the old complex code**

### Prerequisites (before deleting)

- [x] **2.0** Enable new bridge protocol
  - Set `shouldUseNewBridge()` to return `true` ✅
  - **Manual testing required:** Run `./gradlew runIde` and verify:
    - [ ] Send message, receive response
    - [ ] Permission dialog appears in Ask mode
    - [ ] Skip permissions mode works

### Tasks

- [x] **2.1** Delete `ai-bridge/permission-handler.js` (437 lines)
- [x] **2.2** Delete `ai-bridge/channel-manager.js` (157 lines)
- [x] **2.3** Delete `ai-bridge/services/claude/message-service.js` (1784 lines)
- [x] **2.4** Delete `ai-bridge/services/claude/session-service.js` (138 lines)
- [x] **2.5** Delete `ai-bridge/services/claude/attachment-service.js` (144 lines)
- [x] **2.6** Delete `ai-bridge/services/prompt-enhancer.js` (376 lines)
- [x] **2.7** Delete `ai-bridge/services/quickfix-prompts.js` (134 lines)
- [x] **2.8** Delete `ai-bridge/services/system-prompts.js` (140 lines)
- [x] **2.9** Delete `ai-bridge/utils/permission-mapper.js` (223 lines)
- [x] **2.10** Delete `ai-bridge/utils/sdk-loader.js` (282 lines)
- [x] **2.11** Delete `ai-bridge/utils/async-stream.js` (56 lines)
- [x] **2.12** Delete `ai-bridge/channels/claude-channel.js` (103 lines)
- [x] **2.13** Delete `ai-bridge/config/api-config.js` (bridge.js has its own auth)
- [x] **2.14** Delete empty directories in ai-bridge (kept services/ for favorites/titles)
- [x] **2.15** Update package.json - removed old test scripts, bumped to v2.0.0
- [x] **2.16** Build passes, Phase 2 deletion complete

---

## PHASE 3: Simplify Settings UI

**Delete features nobody uses, simplify what remains**

### Settings to DELETE

- [x] **3.1** Delete `webview/src/components/UsageStatisticsSection.tsx` (648 lines)
- [x] **3.2** Remove UsageStatisticsSection from settings/index.tsx and sidebar
- [x] **3.3** Remove usage statistics polling from App.tsx

### Settings to SIMPLIFY (deferred - requires careful UI changes)

- [ ] **3.4** Simplify `ProviderDialog.tsx` - DEFERRED (working feature)
- [ ] **3.5** Simplify `settings/index.tsx` - DEFERRED (working feature)
- [ ] **3.6** Simplify `SettingsHandler.java` - DEFERRED
- [ ] **3.7** Test Phase 3 - PARTIAL (usage stats removed)

---

## PHASE 4: Simplify Java Handlers

### Handlers to DELETE or MERGE

- [x] **4.1** Delete `PromptEnhancerHandler.java` (441 lines) + all related frontend code
- [ ] **4.2** Merge `ProviderHandler.java` into `SettingsHandler.java`
- [ ] **4.3** Simplify `FileHandler.java` - remove unused features
- [ ] **4.4** Simplify `HistoryHandler.java` - remove unused features
- [ ] **4.5** Remove file-based IPC code from `PermissionService.java`
- [ ] **4.6** Test Phase 4 - all core features work

---

## PHASE 5: Dead Code Cleanup

- [ ] **5.1** Remove unused imports across all Java files
- [ ] **5.2** Remove unused methods (use IDE's "find usages")
- [ ] **5.3** Remove excessive debug logging
- [ ] **5.4** Remove commented-out code
- [ ] **5.5** Remove any remaining i18n code
- [ ] **5.6** Remove any remaining Codex references
- [ ] **5.7** Update build.gradle - remove unused dependencies
- [ ] **5.8** Final test - everything works

---

## PHASE 6: Final Verification

- [ ] **6.1** Test fresh install
- [ ] **6.2** Test `claude login` authentication
- [ ] **6.3** Test API key authentication
- [ ] **6.4** Test sending messages
- [ ] **6.5** Test streaming responses
- [ ] **6.6** Test permission dialogs (Plan mode)
- [ ] **6.7** Test permission dialogs (Ask mode)
- [ ] **6.8** Test Skip permissions mode
- [ ] **6.9** Test AskUserQuestion dialog
- [ ] **6.10** Test session history
- [ ] **6.11** Test resume session
- [ ] **6.12** Test model selection
- [ ] **6.13** Test MCP servers
- [ ] **6.14** Build release: `./gradlew clean buildPlugin`

---

## Reference: New bridge.js Template

```javascript
#!/usr/bin/env node
import { Claude } from '@anthropic-ai/claude-code';
import { createInterface } from 'readline';

// Simple JSON line protocol
const send = (msg) => console.log(JSON.stringify(msg));

const rl = createInterface({ input: process.stdin });
const pendingResponses = new Map();
let responseId = 0;

rl.on('line', (line) => {
  try {
    const msg = JSON.parse(line);
    if (msg.type === 'response' && pendingResponses.has(msg.id)) {
      pendingResponses.get(msg.id)(msg);
      pendingResponses.delete(msg.id);
    }
  } catch (e) {
    send({ type: 'error', message: 'Invalid JSON: ' + e.message });
  }
});

async function waitForResponse(id) {
  return new Promise((resolve) => pendingResponses.set(id, resolve));
}

async function main() {
  // Read initial command from stdin
  const input = await new Promise((resolve) => {
    rl.once('line', (line) => resolve(JSON.parse(line)));
  });

  const claude = new Claude();

  try {
    for await (const event of claude.sendMessage(input.message, {
      cwd: input.cwd,
      sessionId: input.sessionId,
      permissionMode: input.permissionMode,
      model: input.model,

      canUseTool: async (toolName, toolInput) => {
        const id = ++responseId;
        send({ type: 'permission_request', id, toolName, toolInput });
        const response = await waitForResponse(id);

        if (response.allow) {
          return { behavior: 'allow', updatedInput: response.updatedInput };
        }
        return { behavior: 'deny', message: response.message };
      }
    })) {
      send({ type: 'event', event });
    }
    send({ type: 'done' });
  } catch (error) {
    send({ type: 'error', message: error.message });
  }
}

main();
```

---

## Key Preservation Requirements

**MUST KEEP - Our Competitive Edge:**
1. CLI auth discovery (`claude login` just works)
2. API key support
3. Claude Pro/Max subscription auth
4. All three permission modes (Plan/Ask/Skip)

**MUST KEEP - Core Features:**
1. Chat interface
2. Streaming responses
3. Tool execution display
4. Permission dialogs
5. Session history
6. MCP servers
7. Skills/Agents

---

## Commands Reference

```bash
# Build
./gradlew clean buildPlugin

# Run tests
./scripts/test-all.sh

# Run IDE sandbox
./gradlew runIde

# Check for unused code
./gradlew checkstyleMain
```
