# Notes: Large File Refactoring Research

## File Analysis Summary

### 1. App.tsx (2800 lines)

**Current State:**
- 30+ useState hooks
- 16 useEffect hooks
- Multiple refs for tracking various state
- Handles: chat view, history view, settings view, permissions, toasts, streaming, rewind

**Key State Groups Identified:**
```
Permission Dialog:
- permissionRequest
- showPermissionDialog
- permissionDialogKey

Ask User Question:
- askUserQuestion
- showAskUserDialog

Rewind:
- rewindDialogData
- showRewindDialog
- selectedFiles
- rewindLoading

Streaming:
- currentToolResultIdRef
- lastStreamUpdateRef
- streamBufferRef
- isStreaming
- streamingContent

Provider/Model:
- providerConfig
- model
- availableModels
- usageData
```

**Main useEffect Dependencies:**
- Bridge message handler (largest, ~300 lines of logic)
- Provider config loading
- Session initialization
- Scroll management

---

### 2. ClaudeSDKToolWindow.java (2218 lines)

**Structure:**
```java
public class ClaudeSDKToolWindow implements ToolWindowFactory {
    // ~100 lines - factory methods

    private static class ClaudeChatWindow extends JPanel {
        // ~1700 lines - ALL the real logic

        // Error panels (~300 lines)
        // JS bridge (~200 lines)
        // Streaming (~200 lines)
        // Session management (~400 lines)
        // UI setup (~600 lines)
    }
}
```

**Error Panel Methods:**
- `showErrorPanel(String message, @Nullable Runnable retryAction)`
- `showVersionErrorPanel(String version, String minVersion)`
- `showInvalidNodePathPanel()`
- `showBridgeErrorPanel(int exitCode, String stderr)`
- `showJcefNotSupportedPanel()`
- `showLoadingPanel()`

**Streaming Methods:**
- `enqueueStreamMessageUpdate(String id, String type, Object data)`
- `scheduleStreamMessageUpdatePush()`
- `flushStreamMessageUpdates()`
- `sendStreamMessagesToWebView(List<StreamMessageUpdate> updates)`

---

### 3. ChatInputBox.tsx (1914 lines)

**Already Has Hooks:**
- `hooks/useTriggerDetection.ts` (643 lines - also large!)
- `hooks/useCompletionDropdown.ts` (320 lines)

**Remaining in Main Component:**
- Contenteditable setup and management
- Keyboard event handling
- Attachment logic
- IME composition handling
- File reference tag rendering

**useTriggerDetection.ts Analysis:**
- Handles both @ and / triggers
- Could split into useAtTrigger and useSlashTrigger
- Shares some common detection logic

---

### 4. ClaudeSDKBridge.java (1679 lines)

**Structure:**
```java
public class ClaudeSDKBridge extends BaseSDKBridge {
    // Query execution (~300 lines)
    // Session messages (~200 lines)
    // Slash commands (~200 lines)
    // MCP status (~200 lines)
    // File rewind (~200 lines)
    // Callbacks and utilities (~500 lines)
}
```

**Key Methods to Extract:**
- `getSessionMessages()` - parses JSON, handles pagination
- `loadHistorySession()` - loads from file
- `getSlashCommands()` - calls claude code --print /
- `getMcpServerStatus()` - calls mcp status endpoint
- `rewindFiles()` - handles file restoration

---

### 5. SettingsHandler.java (1281 lines)

**Message Types Handled (23+):**
```
Provider operations:
- addProvider, updateProvider, deleteProvider
- switchProvider, getProviders, getActiveProvider
- saveImportedProviders

Model/Usage:
- setModel, getUsageStatistics
- pushUsageUpdateAfterModelChange

Settings:
- getSettings, saveSettings
- getClaudeCodeSettings, saveClaudeCodeSettings

Auth:
- checkProviderAuth, getAuthStatus

Other:
- getMcpServers, saveMcpServers
- getHistory, clearHistory
```

---

## Refactoring Patterns to Use

### React Hooks Pattern
```typescript
// Before: State in component
const [permissionRequest, setPermissionRequest] = useState(null);
const [showPermissionDialog, setShowPermissionDialog] = useState(false);

// After: Custom hook
const {
  permissionRequest,
  showPermissionDialog,
  handlePermissionResponse,
  closePermissionDialog
} = usePermissionDialog();
```

### Java Extraction Pattern
```java
// Before: Method in large class
private void handleAddProvider(JsonObject data) { ... }

// After: Delegate to focused class
private final ProviderOperationsHandler providerOps;

private void handleAddProvider(JsonObject data) {
    providerOps.handleAdd(data, this::sendResponse);
}
```

### Composition over Inheritance
- Prefer injecting dependencies via constructor
- Use interfaces for callbacks
- Keep extracted classes stateless where possible

---

## File Locations Reference

**Webview hooks location:** `webview/src/hooks/`
**Component hooks location:** `webview/src/components/[Component]/hooks/`
**Java handlers location:** `src/main/java/com/github/claudecodegui/handler/`
**Java UI location:** `src/main/java/com/github/claudecodegui/ui/`
**Java bridge location:** `src/main/java/com/github/claudecodegui/bridge/`
