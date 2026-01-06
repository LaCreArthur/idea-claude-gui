# Plan Mode Implementation

> **Date**: 2026-01-06
> **Status**: Not Implemented (UI disabled)
> **Priority**: Feature Enhancement

---

## Executive Summary

### Why Plan Mode is Disabled

Plan mode is **partially implemented** but disabled because the critical **ExitPlanMode** flow is missing:

| Component | Status | Location |
|-----------|--------|----------|
| SDK `permissionMode: 'plan'` | ✅ Supported | `docs/sdk/claude-agent-sdk.md` |
| Tool blocking in plan mode | ✅ Working | `ai-bridge/services/claude/message-service.js:42-46` |
| UI mode selector | ✅ Exists, but `disabled: true` | `webview/src/components/ChatInputBox/types.ts:197` |
| i18n translations | ✅ Present | `webview/src/i18n/locales/en.json:668-671` |
| **ExitPlanMode tool handler** | ❌ Missing | `ai-bridge/permission-handler.js` |
| **Plan approval dialog** | ❌ Missing | `webview/src/components/` |
| **Mode switching after approval** | ❌ Missing | `ai-bridge/services/claude/message-service.js` |

### Quick Win (Minimal Implementation)

1. Remove `disabled: true` from `types.ts:197`
2. Handle `ExitPlanMode` in `permission-handler.js` by reusing existing permission dialog

This makes plan mode functional without a dedicated approval UI.

### Full Implementation Effort

- **Phase 1**: Enable UI (1 file, low risk)
- **Phase 2**: ExitPlanMode handler (3 files, medium risk)
- **Phase 3**: Plan approval dialog (4+ files, medium risk)
- **Phase 4**: Mode switching (3 files, high risk)
- **Phase 5**: Testing

---

## Current State Analysis

### What Exists

1. **SDK Support** (`docs/sdk/claude-agent-sdk.md`)
   - `PermissionMode` type includes `'plan'` - "Planning mode - no execution"
   - `ExitPlanMode` tool exists with input/output interfaces
   - `setPermissionMode()` method on Query object for runtime mode changes

2. **ai-bridge Implementation** (`ai-bridge/services/claude/message-service.js:42-46`)
   ```javascript
   if (normalizedPermissionMode === 'plan') {
     return {
       decision: 'block',
       reason: 'Permission mode is plan (no execution)'
     };
   }
   ```
   - Plan mode already blocks ALL tool execution via PreToolUse hook

3. **Webview UI** (`webview/src/components/ChatInputBox/types.ts:194-199`)
   ```typescript
   {
     id: 'plan',
     label: '规划模式',
     icon: 'codicon-tasklist',
     disabled: true,  // <-- Explicitly disabled
     tooltip: '规划模式——无执行（暂不支持）',
     description: '仅规划不执行，暂不支持'
   }
   ```

4. **i18n** (`webview/src/i18n/locales/en.json:668-671`)
   - Has translations for plan mode labels
   - Description says "not supported yet"

### Why It's Disabled

The core issue is that while **tool blocking works**, the **ExitPlanMode flow is not implemented**:

1. When user selects plan mode and sends a message, Claude plans without executing
2. Claude eventually calls `ExitPlanMode` tool with the plan for approval
3. **Missing**: No handler for `ExitPlanMode` tool in the plugin
4. **Missing**: No UI to display the plan and let user approve/reject
5. **Missing**: No mechanism to switch from plan mode to execution mode after approval

## Plan Mode Flow (CLI Reference)

```
User selects Plan Mode
        ↓
User sends message
        ↓
Claude analyzes, plans (all tools blocked)
        ↓
Claude calls ExitPlanMode({ plan: "..." })
        ↓
Plugin shows plan approval dialog
        ↓
User approves/rejects
        ↓
If approved: Switch to default/acceptEdits mode, continue execution
If rejected: Stay in plan mode, Claude can revise
```

## Implementation Plan

### Phase 1: Enable Plan Mode Selection (Low Risk)

**Files to modify:**
- `webview/src/components/ChatInputBox/types.ts`

**Changes:**
1. Remove `disabled: true` from the plan mode definition
2. Update tooltip/description to indicate it's now supported

**Testing:**
- Verify plan mode appears in mode selector
- Verify selecting plan mode updates the UI state
- Verify plan mode is passed to ai-bridge correctly

---

### Phase 2: ExitPlanMode Tool Handler (Core Feature)

**Files to modify:**
- `ai-bridge/permission-handler.js`
- `ai-bridge/services/claude/message-service.js`
- `src/main/java/com/github/claudecodegui/handler/PermissionHandler.java`

**Changes:**

1. **ai-bridge/permission-handler.js** - Add ExitPlanMode handling:
   ```javascript
   // In canUseTool function:
   if (toolName === 'ExitPlanMode') {
     // ExitPlanMode needs special handling - show plan approval dialog
     const approved = await requestPlanApprovalFromJava(input);
     if (approved) {
       return {
         behavior: 'allow',
         updatedInput: input,
         // Signal to switch permission mode
         permissionModeChange: approved.newMode || 'default'
       };
     }
     return {
       behavior: 'deny',
       message: 'Plan not approved by user'
     };
   }
   ```

2. **New function in permission-handler.js**:
   ```javascript
   export async function requestPlanApprovalFromJava(input) {
     // Similar to requestPermissionFromJava but for plan approval
     // Request type: 'planApproval'
     // Input contains the plan text
     // Response includes: approved, newMode (what mode to switch to)
   }
   ```

3. **Java PermissionHandler** - Add plan approval request type:
   ```java
   case "planApproval":
       handlePlanApprovalRequest(requestData);
       break;
   ```

---

### Phase 3: Plan Approval UI (User Experience)

**Files to create/modify:**
- `webview/src/components/PlanApprovalDialog.tsx` (new)
- `webview/src/styles/less/components/plan.less` (new)
- `webview/src/i18n/locales/*.json` (add translations)
- `src/main/java/com/github/claudecodegui/handler/PermissionHandler.java`

**UI Design (Reference: VS Code Claude extension pattern):**
```
┌────────────────────────────────────────────┐
│  📋 Plan Ready for Review                  │
├────────────────────────────────────────────┤
│                                            │
│  [Rendered Markdown of the plan]           │
│                                            │
│  - Step 1: Create file X                   │
│  - Step 2: Modify file Y                   │
│  - Step 3: Run tests                       │
│                                            │
├────────────────────────────────────────────┤
│  Execute with mode:                        │
│  ○ Default (confirm each action)           │
│  ● Accept Edits (auto-approve file edits)  │
│  ○ Bypass Permissions (full auto)          │
├────────────────────────────────────────────┤
│     [Reject]              [Execute Plan]   │
└────────────────────────────────────────────┘
```

**Changes:**

1. **PlanApprovalDialog component**:
   - Receives plan text as markdown
   - Renders plan with markdown formatting
   - Mode selector for execution mode
   - Approve/Reject buttons
   - Communicates decision back to Java via bridge

2. **i18n additions**:
   ```json
   "plan": {
     "label": "Plan Mode",
     "tooltip": "Planning only mode - Claude plans without executing",
     "description": "Claude analyzes and creates a plan before execution",
     "approvalTitle": "Plan Ready for Review",
     "executeWith": "Execute with mode:",
     "reject": "Reject",
     "execute": "Execute Plan",
     "revise": "Ask to Revise"
   }
   ```

3. **Java handler**:
   - Watch for planApproval requests
   - Send to webview via message bridge
   - Wait for response from webview
   - Return approval status and selected execution mode

---

### Phase 4: Mode Switching After Approval

**Files to modify:**
- `ai-bridge/services/claude/message-service.js`
- `ai-bridge/channel-manager.js`
- `webview/src/App.tsx`

**Changes:**

1. **After plan approval**, the plugin needs to:
   - Switch `permissionMode` from `'plan'` to the user-selected mode
   - This may require using SDK's `query.setPermissionMode(newMode)`
   - Or restarting the query with the new mode

2. **State management**:
   - Track when we're in "plan approved, transitioning to execution" state
   - Update UI mode indicator after transition

---

### Phase 5: Testing & Polish

**Test cases:**
1. Select plan mode, send message, verify tools are blocked
2. Claude generates plan, ExitPlanMode is called, approval dialog appears
3. Approve with default mode → execution starts with confirmation prompts
4. Approve with acceptEdits → execution starts with auto-approve for edits
5. Reject → stay in plan mode, Claude can revise
6. Cancel during planning → proper cleanup

**Edge cases:**
- User aborts during planning phase
- Network error during plan execution
- Very long plans (scroll handling)
- Multiple sequential plan approvals

---

## Risk Assessment

| Phase | Risk | Mitigation |
|-------|------|------------|
| 1 | Low | Just enabling UI, blocking still works |
| 2 | Medium | Need to ensure ExitPlanMode doesn't break other flows |
| 3 | Medium | UI/UX parity with VS Code reference |
| 4 | High | Mode switching during active session is complex |
| 5 | Low | Standard testing |

## Dependencies

1. Claude SDK must support `ExitPlanMode` tool (confirmed in docs)
2. Understanding of how SDK handles permission mode changes mid-session
3. Java-webview bridge must support new message types

## Recommended Approach

**Start with Phase 1+2** - Enable plan mode and handle ExitPlanMode with a simple confirm dialog (reuse existing permission dialog). This validates the core flow works.

**Then Phase 3** - Build proper plan approval UI.

**Finally Phase 4** - Handle mode switching elegantly.

## Questions to Clarify

1. Does `setPermissionMode()` work mid-conversation in the SDK?
2. Should plan rejection allow Claude to revise or end the conversation?
3. What's the expected UX for very long plans?