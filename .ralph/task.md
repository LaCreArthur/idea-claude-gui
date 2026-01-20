# Current Task: Phase 5 - Permission Cross-Instance Bug - COMPLETE

## Task Complete

Phase 5 (Permission Cross-Instance Bug) is complete:
- `PermissionService` converted from singleton to per-project service
- Registered as `<projectService>` in `plugin.xml`
- All 3 call sites updated to `project.getService(PermissionService.class)`
- `./gradlew compileJava` passes
- `./scripts/test-all.sh` passes

## Original Objective (FIXED)

Fix the permission cross-instance bug: when two IDE instances are running, permission prompts can appear in the wrong instance because `PermissionService` was a JVM singleton shared across all IDE instances.

## Root Cause (from BUG_REPORT_PERMISSION_CROSS_INSTANCE.md)

`PermissionService` uses a static singleton pattern:
```java
private static PermissionService instance;

public static synchronized PermissionService getInstance(Project project) {
    if (instance == null) {
        instance = new PermissionService(project);
    }
    return instance;  // Returns SAME instance for all projects/IDEs
}
```

Once the first IDE creates the singleton, all other IDEs get the same instance. The `project` parameter is ignored after the first call.

## Step-by-Step Fix

### Step 1: Convert PermissionService to Project Service

1. Remove static singleton pattern:
   - Delete `private static PermissionService instance;`
   - Delete `public static synchronized PermissionService getInstance(Project project)`
   - Convert constructor to be non-static and take Project

2. Add IntelliJ service annotation:
   ```java
   @Service(Service.Level.PROJECT)
   public final class PermissionService {
   ```

3. Register in `plugin.xml`:
   ```xml
   <projectService
       serviceImplementation="com.github.claudecodegui.permission.PermissionService"/>
   ```

### Step 2: Update All Call Sites

Find and update all usages of `PermissionService.getInstance(project)`:

```bash
grep -rn "PermissionService.getInstance" src/
```

Change from:
```java
PermissionService.getInstance(project)
```

To:
```java
project.getService(PermissionService.class)
```

Expected call sites (from bug report):
- `ClaudeSDKToolWindow.java:457-465` - setupPermissionService()
- `ClaudeSession.java:537` - permission callback setup

### Step 3: Simplify Service Architecture

With per-project services, each project has its own PermissionService instance. The `dialogShowers` map and `findDialogShowerByInputs()` matching logic may become unnecessary - verify and simplify.

### Step 4: Verify and Test

1. `./gradlew compileJava` - must pass
2. `./scripts/test-all.sh` - must pass
3. Manual test: Open two IDE instances, verify permission prompts appear in correct instance

## Acceptance Criteria

- [x] `PermissionService` is a per-project IntelliJ service (not singleton)
- [x] Registered as `<projectService>` in `plugin.xml`
- [x] All call sites use `project.getService(PermissionService.class)`
- [x] `./gradlew compileJava` passes
- [x] `./scripts/test-all.sh` passes

## After This Task

The epic is complete! All phases done:
- Phase 1: Fixed image attachment bug
- Phase 2: Removed dead code
- Phase 3: Cleaned up references
- Phase 4: Final verification
- Phase 5: Fixed permission cross-instance bug

## Full Task Queue

1. ~~**Phase 1**: Fix image attachment bug~~ (COMPLETE)
2. ~~**Phase 2**: Remove dead code~~ (COMPLETE)
3. ~~**Phase 3**: Clean up references~~ (COMPLETE)
4. ~~**Phase 4**: Final verification~~ (COMPLETE)
5. **Phase 5**: Fix permission cross-instance bug (THIS TASK)
