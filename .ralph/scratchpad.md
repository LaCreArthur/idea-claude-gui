# Scratchpad: Legacy Code Cleanup + Permission Bug

## Current Status

- Iteration: 6 (completed)
- Phase: 5 (Permission Cross-Instance Bug) - COMPLETE
- Blocker: None

## Phase 5 Summary - Permission Cross-Instance Bug Fix

Successfully converted `PermissionService` from a JVM singleton to an IntelliJ per-project service:

### Changes Made

1. **PermissionService.java**:
   - Added `@Service(Service.Level.PROJECT)` annotation
   - Made class `final` (required for project services)
   - Removed `private static PermissionService instance;` singleton field
   - Removed `public static synchronized PermissionService getInstance(Project project)` method
   - Changed constructor from `private` to `public`

2. **plugin.xml**:
   - Added `<projectService serviceImplementation="com.github.claudecodegui.permission.PermissionService"/>` registration

3. **Call sites updated (3 total)**:
   - `ClaudeSession.java:486` - `project.getService(PermissionService.class)`
   - `ClaudeChatWindow.java:254` - `project.getService(PermissionService.class)`
   - `ClaudeChatWindow.java:931` - `project.getService(PermissionService.class)`

### Verification
- `./gradlew compileJava` - PASSED
- `./scripts/test-all.sh` - ALL TESTS PASSED
- `grep "PermissionService.getInstance"` - No matches (confirmed removed)

### Note on Simplification
The `dialogShowers` map structure was kept as-is. With per-project services, this map will only ever contain one entry, but the existing code works correctly. Further simplification would require more extensive refactoring with minimal benefit.

## Assumptions (All Verified)

### Image Attachment Bug (Phase 1 - COMPLETE)
- [x] `shouldUseNewBridge()` always returns true (VERIFIED)
- [x] `bridge.js` extracts and uses `attachments` field (FIXED in iteration 2)
- [x] `ClaudeSession` uses single code path via `sendMessageWithBridge()` (FIXED in iteration 2)

### Dead Code Removal (Phase 2 - COMPLETE)
- [x] `OutputLineProcessor` only used by legacy `sendMessage()` methods (VERIFIED)
- [x] Legacy `sendMessage()` has no external callers (VERIFIED)
- [x] `executeStreamingCommand()` has no callers (VERIFIED)
- [x] `configureProviderEnv()` only called inside `executeStreamingCommand()` (VERIFIED)

### Clean Up References (Phase 3 - COMPLETE)
- [x] `channel-manager.js` doesn't exist in ai-bridge (VERIFIED - only bridge.js exists)
- [x] All client classes used wrong script path (VERIFIED + FIXED)
- [x] BridgeDirectoryResolver validation used wrong script (VERIFIED + FIXED)
- [x] ClaudeChatWindow override check used wrong script (VERIFIED + FIXED)

### Final Verification (Phase 4 - COMPLETE)
- [x] `./scripts/test-all.sh` passes (VERIFIED)
- [x] No legacy format strings in code (VERIFIED)
- [x] No channel-manager.js references in Java source (VERIFIED)

### Permission Bug (Phase 5 - COMPLETE)
- [x] `PermissionService` used static singleton pattern (VERIFIED + FIXED)
- [x] `project` parameter was ignored after first call (VERIFIED + FIXED)
- [x] Converted to IntelliJ per-project service (DONE)
- [x] All call sites updated to `project.getService()` (DONE)

### Image SDK Format Bug (Phase 6 - COMPLETE)
- [x] SDK query() expects `string | AsyncIterable<SDKUserMessage>`, NOT content array (IDENTIFIED)
- [x] Changed buildPrompt() to return async generator for multimodal content (FIXED)
- [x] E2E test passes: image attachment works correctly (VERIFIED)
- [x] All 16 E2E tests pass (VERIFIED)

## Epic Complete!

All phases of the legacy code cleanup epic are now complete:
- Phase 1: Fixed image attachment bug (single code path)
- Phase 2: Removed dead code (OutputLineProcessor, unused methods)
- Phase 3: Fixed all broken references (channel-manager.js -> bridge.js)
- Phase 4: Verified all tests pass and no legacy artifacts remain
- Phase 5: Fixed permission cross-instance bug (singleton -> project service)
- Phase 6: Fixed SDK prompt format for multimodal content (async generator)

## Reference Docs

- `HANDOFF_LEGACY_CODE_CLEANUP.md` - Full details on image bug
- `BUG_REPORT_PERMISSION_CROSS_INSTANCE.md` - Full details on permission bug (Phase 5)
