# Bug Report: Permission Prompts Appearing in Wrong IDE Instance

**Severity:** Critical
**Component:** PermissionService
**Status:** Root cause identified, awaiting fix
**Created:** 2026-01-19

## Summary

When two instances of the JetBrains IDE are running with the plugin installed (e.g., two Rider windows with different projects), permission prompts can appear in the wrong IDE instance. User reported waiting indefinitely in IDE-2 while the permission prompt was displayed in IDE-1.

## Root Cause

**`PermissionService` is a global JVM singleton that is shared across all IDE instances.**

Location: `src/main/java/com/github/claudecodegui/permission/PermissionService.java`

```java
// Lines 19-20
private static PermissionService instance;

// Lines 149-154
public static synchronized PermissionService getInstance(Project project) {
    if (instance == null) {
        instance = new PermissionService(project);
    }
    return instance;  // Returns SAME instance for all projects/IDEs
}
```

Once the first IDE instance creates the singleton, all subsequent IDE instances get the **same singleton** regardless of which project they pass. The `project` parameter is ignored after the first call.

## Bug Manifestation Flow

```
1. User opens IDE-1 (Project A)
   └─> PermissionService.instance created with project=A
   └─> dialogShowers = {ProjectA → showerA}

2. User opens IDE-2 (Project B)
   └─> getInstance(ProjectB) returns EXISTING instance
   └─> dialogShowers = {ProjectA → showerA, ProjectB → showerB}

3. IDE-2 makes a tool call requiring permission
   └─> ai-bridge sends permission request
   └─> PermissionService.findDialogShowerByInputs() is called

4. Path matching logic attempts to find correct project by file path
   └─> If matching FAILS (symlinks, normalization, case sensitivity)
   └─> Fallback: returns dialogShowers.values().iterator().next()
   └─> Returns showerA (IDE-1's shower) ← WRONG!

5. Permission dialog appears in IDE-1 instead of IDE-2
   └─> User in IDE-2 waits indefinitely
```

## Problematic Code Sections

### 1. Singleton Pattern (Primary Issue)

File: `PermissionService.java:149-154`

The singleton pattern is inappropriate for multi-project scenarios in IntelliJ. IntelliJ plugins should use per-project services.

### 2. Fallback Logic (Secondary Issue)

File: `PermissionService.java:310-312`

```java
// No match found, use first registered
Map.Entry<Project, PermissionDialogShower> firstEntry =
    dialogShowers.entrySet().iterator().next();
return firstEntry.getValue();  // Arbitrary - could be wrong IDE!
```

When file path matching fails, the code arbitrarily returns the first registered shower rather than failing safely or using a more reliable matching strategy.

### 3. Path Matching Fragility

File: `PermissionService.java:257-309`

The `findDialogShowerByInputs()` method tries to extract file paths from tool inputs and match them to project base paths. This can fail due to:
- Symlinks
- Case sensitivity differences
- Path normalization issues
- Tools that don't include file paths in inputs

## What Works Correctly

| Component | Status | Notes |
|-----------|--------|-------|
| ai-bridge process spawning | ✅ Correct | Each call spawns new process |
| MessageDispatcher | ✅ Correct | Per-ClaudeChatWindow instance |
| dialogShowers Map | ✅ Correct design | ConcurrentHashMap, per-project entries |
| Permission callbacks | ✅ Correct | Passed per-invocation |

## Recommended Fix

### Option A: Per-Project Service (Recommended)

Replace singleton with IntelliJ's project-level service:

```java
// Register in plugin.xml
<projectService
    serviceImplementation="...PermissionService"/>

// Usage
PermissionService service = project.getService(PermissionService.class);
```

Each IDE instance/project gets its own isolated service instance.

### Option B: Process-Based Routing

Track which ai-bridge process belongs to which project and route permission responses back to the originating process directly, bypassing the file-path matching entirely.

### Option C: Session-Based Routing

Include a session/instance ID in permission requests that maps back to the correct dialog shower without relying on file path matching.

## Testing Considerations

After fix, test matrix should include:
- [ ] Single IDE, single project - permission prompts work
- [ ] Two IDEs, different projects - prompts appear in correct instance
- [ ] Two IDEs, same project opened twice - behavior is defined
- [ ] Permission denied in one IDE doesn't affect the other
- [ ] Rapid permission requests from both IDEs simultaneously

## Code References

- `PermissionService.java:19-20` - Singleton instance variable
- `PermissionService.java:149-154` - getInstance() singleton creation
- `PermissionService.java:257-313` - findDialogShowerByInputs() routing logic
- `PermissionService.java:310-312` - Fallback to arbitrary shower
- `ClaudeSDKToolWindow.java:457-465` - setupPermissionService() registration
- `ClaudeSession.java:537` - getInstance() call site

## Notes for Refactoring

- Code structure may change during ongoing refactoring
- Core issue is the static singleton pattern - any fix needs to ensure instance isolation
- IntelliJ's `@Service(Service.Level.PROJECT)` annotation is the idiomatic solution
- Consider whether other services have similar singleton issues
