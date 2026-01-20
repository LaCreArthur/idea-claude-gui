# Task Plan: Refactor Large Files to Prevent Token Limit Errors

## Goal
Split files over 1000 lines into smaller, focused modules so Claude can read them without hitting the 25000 token limit.

## Target Files (Priority Order)

| # | File | Lines | Target |
|---|------|-------|--------|
| 1 | `webview/src/App.tsx` | 2800 | ~800 |
| 2 | `src/.../ClaudeSDKToolWindow.java` | 2218 | ~600 |
| 3 | `webview/src/components/ChatInputBox/ChatInputBox.tsx` | 1914 | ~600 |
| 4 | `src/.../ClaudeSDKBridge.java` | 1679 | ~700 |
| 5 | `src/.../SettingsHandler.java` | 1281 | ~600 |

---

## Phase 1: App.tsx Refactoring

### 1.1 Extract Custom Hooks
- [x] **usePermissionDialog.ts** - Extract permission dialog state (DONE - Iteration 1)
  - State: `permissionDialogOpen`, `currentPermissionRequest`
  - Handlers: handleApprove, handleApproveAlways, handleSkip, queueRequest
  - Location: `webview/src/hooks/usePermissionDialog.ts`
  - Result: App.tsx reduced by 72 lines

- [x] **useAskUserQuestion.ts** - Extract ask user question state (DONE - Iteration 2)
  - State: `askUserQuestionDialogOpen`, `currentAskUserQuestionRequest`
  - Handlers: handleSubmit, handleCancel, queueRequest
  - Location: `webview/src/hooks/useAskUserQuestion.ts`
  - Result: App.tsx reduced by 53 lines

- [x] **useRewindDialog.ts** - Extract rewind dialog state (DONE - Iteration 3)
  - State: `isRewindDialogOpen`, `currentRewindRequest`, `isRewinding`, `isRewindSelectDialogOpen`
  - Handlers: handleRewindConfirm, handleRewindCancel, openRewindDialog, openRewindSelectDialog, handleRewindSelectCancel, handleRewindResult
  - Location: `webview/src/hooks/useRewindDialog.ts`
  - Result: App.tsx reduced by 32 lines

- [x] **useStreamingState.ts** - Extract streaming refs and state (DONE - Iteration 4)
  - Refs: streamingContentRef, isStreamingRef, useBackendStreamingRenderRef, streamingTextSegmentsRef, activeTextSegmentIndexRef, streamingThinkingSegmentsRef, activeThinkingSegmentIndexRef, seenToolUseCountRef, streamingMessageIndexRef, contentUpdateTimeoutRef, thinkingUpdateTimeoutRef, lastContentUpdateRef, lastThinkingUpdateRef, isAutoScrollingRef, autoExpandedThinkingKeysRef
  - State: `streamingActive`
  - Constant: `THROTTLE_INTERVAL`
  - Location: `webview/src/hooks/useStreamingState.ts`
  - Result: App.tsx reduced by 4 lines net (code organization improvement)

- [x] **useProviderConfig.ts** - Extract provider/model state (DONE - Iteration 5)
  - State: `currentProvider`, `selectedClaudeModel`, `claudePermissionMode`, `permissionMode`, `activeProviderConfig`, `claudeSettingsAlwaysThinkingEnabled`
  - Ref: `currentProviderRef`
  - Helper: `syncActiveProviderModelMapping()`
  - Location: `webview/src/hooks/useProviderConfig.ts`
  - Result: App.tsx reduced by 21 lines

- [~] **useBridgeMessages.ts** - Extract Java bridge message handling (PARTIAL - Iteration 6-7)
  - [x] Extracted streaming helper utilities to `webview/src/utils/streamingHelpers.ts`
    - `findLastAssistantIndex`, `extractRawBlocks`, `buildStreamingBlocks`
    - `getOrCreateStreamingAssistantIndex`, `patchAssistantForStreaming`
    - Created `StreamingRefs` interface for passing refs to functions
  - Result: App.tsx reduced by 77 lines (2618 -> 2541)
  - [ ] Remaining: Window callback extraction (complex, ~700 lines with 40+ callbacks)

- [x] **useSessionHandlers.ts** - Extract session management handlers (Iteration 9)
  - `interruptSession`, `createNewSession`, `handleConfirmNewSession`, `handleCancelNewSession`
  - `handleConfirmInterrupt`, `handleCancelInterrupt`
  - `loadHistorySession`, `deleteHistorySession`, `exportHistorySession`
  - `toggleFavoriteSession`, `updateHistoryTitle`
  - Result: App.tsx reduced by 134 lines (2312 -> 2178)

### 1.2 Extract View Components
- [ ] **ChatView.tsx** - Extract main chat rendering
  - Message list rendering
  - Input area integration
  - Scroll handling
  - Location: `webview/src/components/ChatView/ChatView.tsx`

### 1.3 Extract Utility Functions
- [x] Move to `webview/src/utils/bridge.ts` (Iteration 7):
  - Already had `sendBridgeEvent()` - removed duplicate `sendBridgeMessage()` from App.tsx
  - Replaced 35 call sites with existing utility
  - Result: App.tsx reduced by 8 lines
- [x] Move to `webview/src/utils/helpers.ts` (Iteration 7):
  - Added `formatTime()` and `isTruthy()` to existing helpers file
  - Removed local definitions from App.tsx
  - Result: App.tsx reduced by 11 lines (total -19 lines: 2541 -> 2522)
- [x] Create `webview/src/utils/messageUtils.ts` (Iteration 8):
  - Extracted `getMessageText()`, `shouldShowMessage()`, `normalizeBlocks()`, `getContentBlocks()`, `localizeMessage()`
  - Result: App.tsx reduced by 210 lines (2522 -> 2312)

### 1.4 Verification
- [ ] Run `npm test --prefix webview` - all tests pass
- [ ] Manual test: chat works, permissions work, streaming works
- [ ] Verify App.tsx is under 1000 lines

---

## Phase 2: ClaudeSDKToolWindow.java Refactoring

### 2.1 Extract ClaudeChatWindow to Separate File
- [ ] Create `src/main/java/.../ui/ClaudeChatWindow.java`
- [ ] Move entire inner class to new file
- [ ] Update imports and visibility modifiers
- [ ] Keep `ClaudeSDKToolWindow` as thin factory

### 2.2 Extract ErrorPanelManager
- [ ] Create `src/main/java/.../ui/ErrorPanelManager.java`
- [ ] Move methods:
  - `showErrorPanel()`
  - `showVersionErrorPanel()`
  - `showInvalidNodePathPanel()`
  - `showBridgeErrorPanel()`
  - `showJcefNotSupportedPanel()`
  - `showLoadingPanel()`
- [ ] Use builder pattern or static factory methods

### 2.3 Extract StreamingMessageHandler
- [ ] Create `src/main/java/.../streaming/StreamingMessageHandler.java`
- [ ] Move methods:
  - `enqueueStreamMessageUpdate()`
  - `scheduleStreamMessageUpdatePush()`
  - `flushStreamMessageUpdates()`
  - `sendStreamMessagesToWebView()`
- [ ] Pass webview reference via constructor

### 2.4 Extract JsBridgeHandler
- [ ] Create `src/main/java/.../bridge/JsBridgeHandler.java`
- [ ] Move `handleJavaScriptMessage()` method
- [ ] Move JS execution utilities

### 2.5 Verification
- [ ] Run `./gradlew test` - all tests pass
- [ ] Run `./gradlew runIde` - plugin loads correctly
- [ ] Verify ClaudeSDKToolWindow.java is under 800 lines

---

## Phase 3: ChatInputBox.tsx Refactoring

### 3.1 Split useTriggerDetection.ts (643 lines)
- [ ] Create `useAtTrigger.ts` - @ mention trigger logic
- [ ] Create `useSlashTrigger.ts` - / command trigger logic
- [ ] Keep `useTriggerDetection.ts` as coordinator

### 3.2 Extract Additional Hooks
- [ ] **useKeyboardHandlers.ts**
  - Enter/Shift+Enter handling
  - Escape handling
  - Arrow key navigation
  - Location: `webview/src/components/ChatInputBox/hooks/useKeyboardHandlers.ts`

- [ ] **useAttachmentManagement.ts**
  - Add/remove attachment logic
  - File drop handling
  - Location: `webview/src/components/ChatInputBox/hooks/useAttachmentManagement.ts`

- [ ] **useContentEditable.ts**
  - Contenteditable-specific logic
  - Cursor management
  - Selection handling
  - Location: `webview/src/components/ChatInputBox/hooks/useContentEditable.ts`

### 3.3 Verification
- [ ] Run `npm test --prefix webview` - all tests pass
- [ ] Manual test: input works, completions work, attachments work
- [ ] Verify ChatInputBox.tsx is under 800 lines

---

## Phase 4: ClaudeSDKBridge.java Refactoring

### 4.1 Extract Session Operations
- [ ] Create `src/main/java/.../provider/claude/SessionOperations.java`
- [ ] Move:
  - `getSessionMessages()`
  - `loadHistorySession()`
  - Session message parsing logic

### 4.2 Extract Slash Command Client
- [ ] Create `src/main/java/.../provider/claude/SlashCommandClient.java`
- [ ] Move:
  - `getSlashCommands()`
  - Slash command parsing logic

### 4.3 Extract MCP Status Client
- [ ] Create `src/main/java/.../provider/claude/McpStatusClient.java`
- [ ] Move:
  - `getMcpServerStatus()`
  - MCP response parsing

### 4.4 Extract Rewind Operations
- [ ] Create `src/main/java/.../provider/claude/RewindOperations.java`
- [ ] Move:
  - `rewindFiles()` methods
  - File rewind logic

### 4.5 Verification
- [ ] Run `./gradlew test` - all tests pass
- [ ] Manual test: sessions load, slash commands work, MCP status works
- [ ] Verify ClaudeSDKBridge.java is under 800 lines

---

## Phase 5: SettingsHandler.java Refactoring

### 5.1 Extract Provider Operations Handler
- [ ] Create `src/main/java/.../handler/ProviderOperationsHandler.java`
- [ ] Move:
  - `handleAddProvider()`
  - `handleUpdateProvider()`
  - `handleDeleteProvider()`
  - `handleSwitchProvider()`
  - `handleGetProviders()`
  - `handleGetActiveProvider()`
  - `handleSaveImportedProviders()`

### 5.2 Extract Model Config Handler
- [ ] Create `src/main/java/.../handler/ModelConfigHandler.java`
- [ ] Move:
  - `handleSetModel()`
  - `handleGetUsageStatistics()`
  - `pushUsageUpdateAfterModelChange()`
  - `sendUsageUpdate()`

### 5.3 Update SettingsHandler
- [ ] SettingsHandler delegates to extracted handlers
- [ ] Keep message routing in SettingsHandler
- [ ] Clean up imports

### 5.4 Verification
- [ ] Run `./gradlew test` - all tests pass
- [ ] Manual test: settings save/load, provider switching works
- [ ] Verify SettingsHandler.java is under 700 lines

---

## Phase 6: Final Verification

- [ ] All files under 1000 lines
- [ ] Full test suite passes: `./scripts/test-all.sh`
- [ ] Manual E2E test of all features
- [ ] Update any documentation if needed
- [ ] Commit each phase separately with clear messages

---

## Key Questions
1. Should hooks be in `src/hooks/` (global) or component-specific folders?
2. Should Java extractions use inheritance or composition?
3. Any shared state that needs Context instead of prop drilling?

## Decisions Made
- [2025-01-19] Hooks go in `src/hooks/` (global) - keeps them discoverable and reusable
- [2025-01-19] Use composition pattern: hooks use sendBridgeEvent from utils/bridge.ts

## Errors Encountered
- (none yet)

## Status
**Phase 1.1 COMPLETE** - Extracted usePermissionDialog hook (Iteration 1)
**Phase 1.2 COMPLETE** - Extracted useAskUserQuestion hook (Iteration 2)
**Phase 1.3 COMPLETE** - Extracted useRewindDialog hook (Iteration 3)
**Phase 1.4 COMPLETE** - Extracted useStreamingState hook (Iteration 4)
**Phase 1.5 COMPLETE** - Extracted useProviderConfig hook (Iteration 5)
**Phase 1.6 IN PROGRESS** - Extracted streaming utilities (Iteration 6, -77 lines)
**Phase 1.3 COMPLETE** - Consolidated utility functions (Iteration 7, -19 lines)
**Phase 1.3 COMPLETE** - Extracted message utilities (Iteration 8, -210 lines)
**Phase 1.1 COMPLETE** - Extracted useSessionHandlers hook (Iteration 9, -134 lines)
**Phase 1.1 COMPLETE** - Extracted useChatHandlers hook (Iteration 10, -193 lines)
**Phase 1.6 COMPLETE** - Extracted useStreamingCallbacks hook (Iteration 11, -216 lines)
**Phase 1.6 COMPLETE** - Extracted useSettingsCallbacks hook (Iteration 12, -163 lines)
**Current:** App.tsx at 1606 lines (was 2800, -1194 lines, 42.6% reduction)
**Next:** Continue hook extractions (main useEffect ~280 lines) or start ChatView component extraction
