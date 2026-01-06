# Plan Mode Implementation

> **Date**: 2026-01-06
> **Status**: Implemented (Phases 1-4 complete)
> **Priority**: Feature Enhancement

---

## Executive Summary

### Implementation Status

Plan mode is now **fully implemented** with a dedicated plan approval dialog and dynamic mode switching:

| Component | Status | Location |
|-----------|--------|----------|
| SDK `permissionMode: 'plan'` | ✅ Supported | `docs/sdk/claude-agent-sdk.md` |
| Tool blocking in plan mode | ✅ Working | `ai-bridge/services/claude/message-service.js:54-65` |
| UI mode selector | ✅ Enabled | `webview/src/components/ChatInputBox/types.ts` |
| i18n translations | ✅ Updated | `webview/src/i18n/locales/*.json` |
| **ExitPlanMode tool handler** | ✅ Implemented | `ai-bridge/permission-handler.js:368-401` |
| **Plan approval dialog** | ✅ Implemented | `webview/src/components/PlanApprovalDialog.tsx` |
| **Java handler** | ✅ Implemented | `PermissionService.java`, `PermissionHandler.java` |
| **Session state module** | ✅ Implemented | `ai-bridge/session-state.js` |
| **Dynamic mode switching** | ✅ Implemented | `message-service.js` (sessionRef pattern) |
| **Mode change notification** | ✅ Implemented | `ClaudeSDKBridge.java` → webview chain |

### What Was Done

1. **Phase 1**: Enabled plan mode in UI (removed `disabled: true`), updated i18n
2. **Phase 2**: Added ExitPlanMode handler and `requestPlanApprovalFromJava()` in permission-handler.js
3. **Phase 3**: Created PlanApprovalDialog React component with mode selector, Java handlers, and window bridge

### Phase 4 Complete (2026-01-06)

Mode switching after approval is now implemented:
- Created `ai-bridge/session-state.js` for shared mutable mode state
- Modified `message-service.js` to read from session state dynamically in PreToolUse hook
- Modified `permission-handler.js` to call `setEffectiveMode()` after ExitPlanMode approval
- Added `mode_change` message handling in Java handlers (ClaudeSDKBridge.java, ClaudeMessageHandler.java)
- Added `onModeChanged` callback to notify webview of mode changes

Remaining: End-to-end testing with actual SDK to verify behavior.

---

## Implementation Details (Phases 1-3)

### Phase 1: Enable Plan Mode Selection

**Files Modified:**

1. **`webview/src/components/ChatInputBox/types.ts`**
   - Removed `disabled: true` from plan mode definition
   - Updated tooltip and description to indicate it's now supported
   ```typescript
   {
     id: 'plan',
     label: '规划模式',
     icon: 'codicon-tasklist',
     // disabled: true  <-- REMOVED
     tooltip: '规划模式——Claude先规划，审批后执行',
     description: 'Claude先分析并创建计划，审批后再执行'
   }
   ```

2. **i18n files** (`en.json`, `zh.json`, `ja.json`)
   - Updated plan mode descriptions
   - Added new `planApproval` section with dialog translations:
   ```json
   "planApproval": {
     "title": "Plan Ready for Review",
     "subtitle": "Claude has created a plan. Review and approve to start execution.",
     "executeWith": "Execute with mode:",
     "modeDefault": "Default (confirm each action)",
     "modeAcceptEdits": "Accept Edits (auto-approve file changes)",
     "modeBypass": "Full Auto (bypass all permissions)",
     "reject": "Reject",
     "execute": "Execute Plan"
   }
   ```

### Phase 2: ExitPlanMode Tool Handler

**Files Modified:**

1. **`ai-bridge/services/claude/message-service.js:42-53`**
   - Modified PreToolUse hook to allow ExitPlanMode through in plan mode
   ```javascript
   // In plan mode, block all tools EXCEPT ExitPlanMode
   if (normalizedPermissionMode === 'plan') {
     if (input?.tool_name === 'ExitPlanMode') {
       console.log('[PERM_DEBUG] Allowing ExitPlanMode through in plan mode');
       // Let ExitPlanMode go through to canUseTool for plan approval dialog
     } else {
       return {
         decision: 'block',
         reason: 'Permission mode is plan (no execution)'
       };
     }
   }
   ```

2. **`ai-bridge/permission-handler.js:173-249`**
   - Added `requestPlanApprovalFromJava()` function for file-based IPC
   - Uses `plan-approval-{requestId}.json` and `plan-approval-response-{requestId}.json` files
   - Same polling pattern as existing permission requests (100ms interval, indefinite wait)

3. **`ai-bridge/permission-handler.js:368-393`**
   - Added ExitPlanMode handling in `canUseTool()` function
   ```javascript
   // Special handling for ExitPlanMode tool
   if (toolName === 'ExitPlanMode') {
     console.log('[PermissionHandler] ExitPlanMode tool called, showing plan approval dialog');
     const approval = await requestPlanApprovalFromJava(input);
     if (approval && approval.approved) {
       console.log('[PermissionHandler] Plan approved, new mode:', approval.newMode);
       return {
         behavior: 'allow',
         updatedInput: {
           ...input,
           approved: true,
           newMode: approval.newMode
         }
       };
     } else {
       console.log('[PermissionHandler] Plan rejected or cancelled');
       return {
         behavior: 'deny',
         message: 'User rejected the plan'
       };
     }
   }
   ```

### Phase 3: Plan Approval UI

**Files Created:**

1. **`webview/src/components/PlanApprovalDialog.tsx`** (NEW)
   - Complete React component with:
     - Markdown rendering using `react-markdown`
     - Mode selector (default/acceptEdits/bypassPermissions)
     - Approve/Reject buttons
     - ESC key to reject
   ```typescript
   export interface PlanApprovalRequest {
     requestId: string;
     plan: string;
   }

   export type ExecutionMode = 'default' | 'acceptEdits' | 'bypassPermissions';
   ```

2. **`webview/src/components/PlanApprovalDialog.css`** (NEW)
   - Full styling matching VS Code's dark theme aesthetic
   - Slide-up animation, gradient headers, radio button styling

**Files Modified:**

3. **`webview/src/App.tsx`**
   - Added state for plan approval dialog
   - Added `showPlanApprovalDialog` window callback registration
   - Added `handlePlanApprovalApprove` and `handlePlanApprovalReject` handlers
   - Renders `PlanApprovalDialog` component

4. **`webview/src/global.d.ts`**
   - Added `showPlanApprovalDialog?: (json: string) => void;` type

5. **`src/main/java/.../permission/PermissionService.java`**
   - Added `PlanApprovalDialogShower` interface
   - Added `registerPlanApprovalDialogShower()` and `unregisterPlanApprovalDialogShower()`
   - Added `handlePlanApprovalRequest()` and `writePlanApprovalResponse()`
   - Added file scanning for `plan-approval-*.json` in `watchLoop()`

6. **`src/main/java/.../handler/PermissionHandler.java`**
   - Added `"plan_approval_response"` to `SUPPORTED_TYPES`
   - Added `showPlanApprovalDialog()` method
   - Added `handlePlanApprovalResponse()` method

7. **`src/main/java/.../ClaudeSDKToolWindow.java`**
   - Registered `PlanApprovalDialogShower` in `setupPermissionService()`
   - Added unregister call in cleanup

---

## IPC Flow Pattern

The plan approval follows the same file-based IPC pattern as permission dialogs:

```
ai-bridge                        Java Plugin                    React Webview
    |                                |                               |
    |-- plan-approval-{id}.json -->  |                               |
    |                                |-- showPlanApprovalDialog() -->|
    |                                |                               |
    |                                |<-- plan_approval_response ----|
    |<- plan-approval-response.json -|                               |
    |                                |                               |
```

**Key Files:**
- Request: `/tmp/claude-permission/plan-approval-{requestId}.json`
- Response: `/tmp/claude-permission/plan-approval-response-{requestId}.json`

---

## Testing Notes

All tests passed after implementation:
```bash
./scripts/test-all.sh
# ✓ Version extraction: 0.2.2
# ✓ TypeScript compilation
# ✓ Vite build (13,927 modules)
# ✓ Java tests
```

---

## Learnings for Future Agents

### 1. Follow the Existing Pattern
The AskUserQuestion implementation was the best reference for this work. It uses the same:
- File-based IPC with unique request IDs
- Polling loop with 100ms interval
- Window callback registration
- DialogShower interface pattern in Java

### 2. The PreToolUse Hook Flow
Understanding the hook chain is critical:
1. `createPreToolUse()` in message-service.js → first filter (mode-based blocking)
2. `shouldAutoApproveTool()` → check if tool can be auto-approved
3. `canUseTool()` in permission-handler.js → handles special tools (ExitPlanMode, AskUserQuestion) or shows permission dialog

### 3. ExitPlanMode Must Pass Through
The key insight was that in plan mode:
- All tools are blocked by `createPreToolUse()`
- EXCEPT ExitPlanMode, which needs to pass through to `canUseTool()` to show the dialog

### 4. Mode Selection UX
The dialog includes a mode selector so users can choose how to execute after plan approval:
- `default` - confirm each action (same as normal)
- `acceptEdits` - auto-approve file edits
- `bypassPermissions` - full auto mode

### 5. JavaScript Closure Mutability (Phase 4)
When you need a closure to see updated values:
- **Don't** pass primitives directly (they're captured by value)
- **Do** pass object references (properties can be mutated)
- The `sessionRef = { sessionId: null }` pattern is reusable for any "late-bound" value

### 6. Multiple Code Paths (Phase 4)
The codebase has two message-sending functions that both needed Phase 4 changes:
- `sendMessage()` - for simple string prompts
- `sendMessageWithAttachments()` - for multimodal inputs
When making architectural changes, always search for parallel implementations.

### 7. Stdout Message Prefixes (Phase 4)
The codebase uses a prefix pattern for structured stdout messages:
- `[SESSION_ID]` - session identifier
- `[TOOL_RESULT]` - tool execution results
- `[MODE_CHANGE]` - permission mode updates (added in Phase 4)
- `[SEND_ERROR]` - error payloads
This allows Java to parse specific messages without full JSON parsing of every line.

### 8. Callback Chain Pattern (Phase 4)
For webview notifications, the chain is:
```
ai-bridge stdout → ClaudeSDKBridge → ClaudeMessageHandler → CallbackHandler → SessionCallback → ClaudeSDKToolWindow → window.callback()
```
Each layer has a specific responsibility. Add new callbacks at each level when needed.

### 9. SDK Does NOT Support 'plan' Mode Natively (CRITICAL)

**Official Documentation**: [platform.claude.com/docs/en/agent-sdk/permissions](https://platform.claude.com/docs/en/agent-sdk/permissions)

The SDK lists four permission modes but explicitly states:
> | `plan` | Planning mode - no execution | **(Not currently supported in SDK)** |

**Symptoms**: Passing `permissionMode: 'plan'` to the SDK causes a "Stream closed" error on message send.

**Solution**: Pass `permissionMode: 'default'` to the SDK, but implement plan mode behavior ourselves via PreToolUse hook:

```javascript
// WRONG - causes Stream closed error
const options = {
  permissionMode: 'plan',  // SDK doesn't support this!
};

// CORRECT - implement plan mode ourselves
const effectivePermissionMode = 'plan';  // User selected this
const sdkPermissionMode = effectivePermissionMode === 'plan' ? 'default' : effectivePermissionMode;

const options = {
  permissionMode: sdkPermissionMode,  // Pass 'default' to SDK
  hooks: {
    PreToolUse: [{
      // Our hook handles plan mode blocking
      hooks: [createPreToolUseHook(effectivePermissionMode, sessionRef)]
    }]
  },
};
```

The PreToolUse hook blocks all tools except `ExitPlanMode` when in plan mode, effectively implementing plan mode behavior without SDK native support.

---

## Phase 4: Mode Switching After Approval (IMPLEMENTED)

> **Completed**: 2026-01-06
> **Approach Used**: Shared Mutable Session State (Approach C)

### Implementation Summary

Phase 4 solved the fundamental problem: after ExitPlanMode approval, subsequent tools need to use the newly selected mode instead of the original "plan" mode.

#### The Challenge

The PreToolUse hook captures the permission mode in a closure when created:
```javascript
// Problem: mode is captured at query start, immutable thereafter
function createPreToolUseHook(permissionMode) {
  return async (input) => {
    // permissionMode is frozen - can't change mid-session
  };
}
```

#### The Solution: Session Reference Pattern

Instead of passing a static mode, pass a **mutable reference object** that can be updated:

```javascript
// Solution: pass a mutable reference that can be updated
const sessionRef = { sessionId: null };

function createPreToolUseHook(initialMode, sessionRef) {
  return async (input) => {
    // Read current mode dynamically from shared state
    const currentMode = sessionRef.sessionId
      ? getEffectiveMode(sessionRef.sessionId, initialMode)
      : initialMode;
    // Now subsequent tools use the updated mode!
  };
}
```

The `sessionRef.sessionId` is initially null and gets populated when we receive the session_id from the SDK's system message.

#### Mode Change Notification Flow

```
ExitPlanMode approved with newMode='acceptEdits'
        ↓
permission-handler.js calls setEffectiveMode(sessionId, 'acceptEdits')
        ↓
permission-handler.js emits: console.log('[MODE_CHANGE]', JSON.stringify({ mode: 'acceptEdits' }))
        ↓
ClaudeSDKBridge.java parses stdout, finds [MODE_CHANGE] prefix
        ↓
ClaudeMessageHandler.java handles 'mode_change' message
        ↓
CallbackHandler.notifyModeChanged() → ClaudeSDKToolWindow.onModeChanged()
        ↓
Webview receives: window.onModeChanged('acceptEdits')
        ↓
UI mode indicator updates
```

### Files Modified (Actual Implementation)

| File | Change | Key Code |
|------|--------|----------|
| `ai-bridge/session-state.js` | **CREATED** | `Map<sessionId, mode>` with get/set/clear |
| `message-service.js` | Use sessionRef pattern | `const sessionRef = { sessionId: null }` |
| `message-service.js` | Dynamic mode reading | `getEffectiveMode(sessionRef.sessionId, initialMode)` |
| `message-service.js` | Update sessionRef | `sessionRef.sessionId = msg.session_id` |
| `permission-handler.js` | Set mode on approval | `setEffectiveMode(sessionId, newMode)` |
| `permission-handler.js` | Emit mode change | `console.log('[MODE_CHANGE]', JSON.stringify({ mode }))` |
| `ClaudeSDKBridge.java` | Parse MODE_CHANGE | `if (line.startsWith("[MODE_CHANGE]"))` |
| `ClaudeMessageHandler.java` | Handle mode_change | `case "mode_change": handleModeChange(content)` |
| `CallbackHandler.java` | Add notifyModeChanged | Forward to SessionCallback |
| `ClaudeSession.java` | Add onModeChanged | Interface method with default impl |
| `ClaudeSDKToolWindow.java` | Forward to webview | `window.onModeChanged(newMode)` |

### Key Learnings

#### 1. Mutable Reference Pattern for Closures
When a closure needs to access values that change after creation, pass a mutable object reference instead of primitive values:
```javascript
// ❌ Primitive is frozen
const mode = 'plan';
const hook = () => console.log(mode); // Always 'plan'

// ✅ Object reference allows updates
const state = { mode: 'plan' };
const hook = () => console.log(state.mode); // Reads current value
state.mode = 'acceptEdits'; // Hook now sees 'acceptEdits'
```

#### 2. Session ID Timing
The session_id comes from a `system` message after the query starts. The implementation handles the race condition by:
1. Starting with `sessionRef.sessionId = null`
2. Falling back to `initialMode` when sessionId is null
3. Using `getEffectiveMode()` once sessionId is available

#### 3. Stdout-Based IPC for Mode Changes
The `[MODE_CHANGE]` prefix pattern was chosen to match existing patterns like `[SESSION_ID]` and `[TOOL_RESULT]`. This allows the Java layer to parse and route messages without complex JSON parsing of every line.

#### 4. Two Code Paths
Both `sendMessage()` and `sendMessageWithAttachments()` needed identical changes. Each function:
- Creates its own `sessionRef`
- Uses the same `createPreToolUseHook(mode, sessionRef)` pattern
- Updates `sessionRef.sessionId` when receiving system message

### Verification

All tests pass after implementation:
```bash
./scripts/test-all.sh
# ✓ 12 webview tests
# ✓ 2 ai-bridge tests
# ✓ Java compilation + tests
# ✓ Vite build (13,929 modules)
```

---

### Deep Analysis (2026-01-06)

#### SDK Constraint Discovery

The SDK's `setPermissionMode()` method **only works in streaming input mode**:

> `setPermissionMode()` - Changes the permission mode (only available in streaming input mode)
> — from `docs/sdk/claude-agent-sdk.md:158`

Streaming input mode requires passing an async generator as the prompt:
```javascript
async function* streamInput() {
  yield { type: 'user', message: { role: 'user', content: "..." } };
}
const q = query({ prompt: streamInput(), options });
await q.setPermissionMode('acceptEdits'); // Only works with streamInput()
```

The current implementation uses a simple string prompt:
```javascript
// ai-bridge/services/claude/message-service.js:296-298
const result = query({
  prompt: message,  // <-- String, not async generator
  options
});
```

**Conclusion**: Approach A (SDK's setPermissionMode) requires major refactoring to streaming input mode.

#### Architecture Analysis

The permission mode flow:
```
message-service.js                    permission-handler.js
       |                                      |
       |-- createPreToolUseHook(mode) ------->| (captures mode in closure)
       |                                      |
       |<---------- canUseTool() -------------|
       |                                      |
       |   [ExitPlanMode approved]            |
       |                                      |
       |   newMode returned but               |
       |   PreToolUse hook still uses         |
       |   original closure-captured mode     |
```

The problem: `createPreToolUseHook(permissionMode)` creates a closure that captures the mode value. This is immutable once the query starts.

### Recommended Implementation: Approach C (Enhanced)

#### Design: Shared Mutable Session State

Create a session-scoped mutable mode tracker that both modules can read/write:

**File: `ai-bridge/session-state.js` (NEW)**
```javascript
/**
 * Session-level mutable state for mode overrides
 * Used to change permission mode after plan approval
 */

// Map of sessionId -> effective mode
const sessionModeOverrides = new Map();

export function setEffectiveMode(sessionId, mode) {
  sessionModeOverrides.set(sessionId, mode);
  console.log(`[SessionState] Mode override set: ${sessionId} -> ${mode}`);
}

export function getEffectiveMode(sessionId, defaultMode) {
  if (sessionModeOverrides.has(sessionId)) {
    return sessionModeOverrides.get(sessionId);
  }
  return defaultMode;
}

export function clearModeOverride(sessionId) {
  sessionModeOverrides.delete(sessionId);
}
```

**File: `ai-bridge/services/claude/message-service.js` (MODIFY)**
```javascript
import { getEffectiveMode } from '../../session-state.js';

function createPreToolUseHook(initialMode, sessionId) {
  return async (input) => {
    // Read current effective mode (may have been updated by ExitPlanMode)
    const currentMode = getEffectiveMode(sessionId, initialMode);

    console.log('[PERM_DEBUG] PreToolUse hook called:', input?.tool_name);
    console.log('[PERM_DEBUG] Effective mode:', currentMode, '(initial:', initialMode, ')');

    // In plan mode, block all tools EXCEPT ExitPlanMode
    if (currentMode === 'plan') {
      if (input?.tool_name === 'ExitPlanMode') {
        // Let through for plan approval dialog
      } else {
        return { decision: 'block', reason: 'Permission mode is plan (no execution)' };
      }
    }

    if (shouldAutoApproveTool(currentMode, input?.tool_name)) {
      return { decision: 'approve' };
    }

    // Pass sessionId to canUseTool for mode switching
    const result = await canUseTool(input?.tool_name, input?.tool_input, { sessionId });
    // ... rest of logic
  };
}
```

**File: `ai-bridge/permission-handler.js` (MODIFY)**
```javascript
import { setEffectiveMode } from './session-state.js';

export async function canUseTool(toolName, input, options = {}) {
  const { sessionId } = options;

  // ... existing code ...

  if (toolName === 'ExitPlanMode') {
    const approval = await requestPlanApprovalFromJava(input);
    if (approval && approval.approved) {
      // UPDATE THE SESSION'S EFFECTIVE MODE
      if (sessionId && approval.newMode) {
        setEffectiveMode(sessionId, approval.newMode);
        console.log('[PermissionHandler] Mode switched to:', approval.newMode);

        // Notify webview of mode change
        notifyModeChange(approval.newMode);
      }
      return {
        behavior: 'allow',
        updatedInput: { ...input, approved: true, newMode: approval.newMode }
      };
    }
    // ... rejection logic
  }
  // ... rest of function
}

function notifyModeChange(newMode) {
  // Write to stdout for Java to pick up
  console.log(JSON.stringify({
    type: 'mode_change',
    mode: newMode
  }));
}
```

#### UI Mode Sync

**File: `src/main/java/.../handler/MessageHandler.java` (MODIFY)**
```java
// Add handling for mode_change messages
if ("mode_change".equals(type)) {
    String newMode = messageObject.get("mode").getAsString();
    // Notify webview
    executeJavaScript("if(window.onModeChanged) window.onModeChanged('" + newMode + "')");
}
```

**File: `webview/src/App.tsx` (ALREADY EXISTS)**
The `onModeChanged` callback already exists and calls `setPermissionMode`.

### Implementation Steps

1. **Create session-state.js module** (new file)
   - Export `setEffectiveMode`, `getEffectiveMode`, `clearModeOverride`

2. **Modify message-service.js**
   - Import session-state module
   - Pass sessionId to `createPreToolUseHook`
   - Have hook read from `getEffectiveMode` on each call
   - Pass sessionId to `canUseTool` calls

3. **Modify permission-handler.js**
   - Import session-state module
   - Call `setEffectiveMode` when ExitPlanMode is approved
   - Emit `mode_change` message to stdout

4. **Modify Java MessageHandler**
   - Handle `mode_change` message type
   - Execute JS to call `window.onModeChanged`

5. **Session cleanup**
   - Call `clearModeOverride` when session ends

### Files to Modify/Create

| File | Action | Purpose |
|------|--------|---------|
| `ai-bridge/session-state.js` | **CREATE** | Shared mutable mode state |
| `ai-bridge/services/claude/message-service.js` | MODIFY | Use session state in hook |
| `ai-bridge/permission-handler.js` | MODIFY | Set mode after approval, notify |
| `src/.../handler/MessageHandler.java` | MODIFY | Handle mode_change message |

### Testing Checklist

1. [ ] Plan mode blocks all tools except ExitPlanMode
2. [ ] Plan approval with "default" → subsequent tools require confirmation
3. [ ] Plan approval with "acceptEdits" → file edits auto-approved
4. [ ] Plan approval with "bypassPermissions" → all tools auto-approved
5. [ ] UI mode indicator updates after approval
6. [ ] Plan rejection → stays in plan mode
7. [ ] Mode override is cleared on new session

### Risk Assessment

| Risk | Mitigation |
|------|------------|
| Session ID collision | Use unique session IDs from SDK |
| Memory leak from orphan overrides | Clear on session end, add TTL |
| Race condition in mode reads | Mode changes happen synchronously before next tool |

### Alternative: Full Streaming Input Refactor (Future)

If the shared state approach proves insufficient, a more complete solution would refactor to streaming input mode:

```javascript
async function* createStreamingPrompt(initialMessage) {
  yield { type: 'user', message: { role: 'user', content: initialMessage } };
  // Subsequent messages could be added via a queue
}

const q = query({ prompt: createStreamingPrompt(message), options });

// Now setPermissionMode works
await q.setPermissionMode('acceptEdits');
```

This would require:
- Major refactoring of message-service.js
- New message queuing mechanism
- Changes to session management
- Careful testing of resume functionality

**Recommendation**: Start with Approach C (shared state), only pursue streaming input if necessary.

---

## Complete File List (All Phases)

| File | Phase | Change |
|------|-------|--------|
| `webview/src/components/ChatInputBox/types.ts` | 1 | Removed `disabled: true` |
| `webview/src/i18n/locales/en.json` | 1 | Added planApproval translations |
| `webview/src/i18n/locales/zh.json` | 1 | Added planApproval translations |
| `webview/src/i18n/locales/ja.json` | 1 | Added planApproval translations |
| `ai-bridge/services/claude/message-service.js` | 2 | Allow ExitPlanMode through in plan mode |
| `ai-bridge/permission-handler.js` | 2 | Added `requestPlanApprovalFromJava()` and ExitPlanMode handling |
| `webview/src/components/PlanApprovalDialog.tsx` | 3 | **NEW** - Dialog component |
| `webview/src/components/PlanApprovalDialog.css` | 3 | **NEW** - Dialog styles |
| `webview/src/App.tsx` | 3 | State, handlers, dialog rendering |
| `webview/src/global.d.ts` | 3 | Type definition for `showPlanApprovalDialog` |
| `src/.../permission/PermissionService.java` | 3 | Interface, file scanning, handlers |
| `src/.../handler/PermissionHandler.java` | 3 | `plan_approval_response` handling |
| `src/.../ClaudeSDKToolWindow.java` | 3 | Register/unregister dialog shower |
| `ai-bridge/session-state.js` | 4 | ✅ CREATED - Shared mutable mode state |
| `ai-bridge/services/claude/message-service.js` | 4 | ✅ Modified - Use session state in hook |
| `ai-bridge/permission-handler.js` | 4 | ✅ Modified - Set mode after approval |
| `src/.../provider/claude/ClaudeSDKBridge.java` | 4 | ✅ Modified - Handle mode_change in stdout |
| `src/.../session/ClaudeMessageHandler.java` | 4 | ✅ Modified - Handle mode_change message |
| `src/.../session/CallbackHandler.java` | 4 | ✅ Modified - Add notifyModeChanged |
| `src/.../ClaudeSession.java` | 4 | ✅ Modified - Add onModeChanged callback |
| `src/.../ClaudeSDKToolWindow.java` | 4 | ✅ Modified - Forward mode change to webview |

---

## Phase 5: Testing & Polish

### Integration Testing

After Phase 4 implementation, comprehensive testing is required:

1. **End-to-End Flow Test**
   - Select plan mode in UI
   - Send a task that requires multiple tools (e.g., "Create a new file and add tests")
   - Verify Claude generates a plan without executing tools
   - Verify ExitPlanMode dialog appears with plan
   - Approve with different modes and verify subsequent tool behavior

2. **Mode Transition Tests**
   - Plan → Default: Each tool should prompt for permission
   - Plan → AcceptEdits: File operations auto-approved, bash prompts
   - Plan → BypassPermissions: All tools auto-approved

3. **Edge Cases**
   - User aborts during planning (ESC key)
   - Plan rejection → verify Claude asks for revision
   - Very long plans (scroll behavior in dialog)
   - Network error during execution phase
   - Session resume with mode override

4. **UI Consistency**
   - Mode indicator updates correctly after approval
   - Dialog styling matches other dialogs
   - i18n works for all supported languages

### Performance Considerations

- Session state map cleanup on session end
- Memory pressure from large plans in dialog
- File-based IPC timing for plan approval

---

## Future Enhancements

### 1. Plan Editing Before Approval
Allow users to edit the plan before approving:
- Add "Edit Plan" button to dialog
- Show text editor with plan
- Send edited plan back to Claude

### 2. Partial Plan Approval
Execute plan step-by-step with approval for each step:
- Parse plan into discrete steps
- Show checkbox for each step
- Only approved steps get executed

### 3. Plan Templates
Save and reuse common plan patterns:
- "Feature Implementation" template
- "Bug Fix" template
- User-defined templates

### 4. Streaming Input Migration
Long-term architectural improvement:
- Refactor to use SDK's streaming input mode
- Native `setPermissionMode()` support
- Better control over conversation flow

---

## Appendix: Original Analysis (Historical)

### Why Plan Mode Was Initially Disabled

The core issue was that while **tool blocking worked**, the **ExitPlanMode flow was not implemented**:

1. When user selects plan mode and sends a message, Claude plans without executing
2. Claude eventually calls `ExitPlanMode` tool with the plan for approval
3. **Was Missing**: No handler for `ExitPlanMode` tool in the plugin
4. **Was Missing**: No UI to display the plan and let user approve/reject
5. **Still Missing**: No mechanism to switch from plan mode to execution mode after approval

### Plan Mode Flow

```
User selects Plan Mode
        ↓
User sends message
        ↓
Claude analyzes, plans (all tools blocked)
        ↓
Claude calls ExitPlanMode({ plan: "..." })
        ↓
Plugin shows plan approval dialog  ← IMPLEMENTED
        ↓
User approves/rejects
        ↓
If approved: Switch to default/acceptEdits mode, continue execution  ← PHASE 4
If rejected: Stay in plan mode, Claude can revise  ← IMPLEMENTED
```

### Risk Assessment (Updated)

| Phase | Risk | Status | Notes |
|-------|------|--------|-------|
| 1 | Low | ✅ Complete | UI enablement only |
| 2 | Medium | ✅ Complete | ExitPlanMode handler working |
| 3 | Medium | ✅ Complete | Dialog with mode selector |
| 4 | Medium | ✅ Complete | Shared state approach implemented successfully |
| 5 | Low | ⏳ Pending | End-to-end testing with actual SDK |