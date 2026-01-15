# Global Simplification - Ralph Loop Prompt

## Pre-Flight Checks (Run Before Starting)

Before entering the loop, verify:
```bash
git status              # Must be clean
./scripts/test-all.sh   # Must pass
```

If either fails, fix before starting. Do NOT proceed with dirty git state.

---

## Current Phase

Check GLOBAL_SIMPLIFICATION_STATE.md to determine current phase. If file doesn't exist, create it and start at Phase A.

---

## Phase A: DEPENDENCY REMOVAL

Execute tasks in order. Each task = one iteration.

### A1: Replace @lobehub/icons with inline Claude SVG

**Pre-check:** Verify `@lobehub/icons` exists in webview/package.json

**Steps:**
1. Create `webview/src/assets/ClaudeIcon.tsx`:
   ```tsx
   export const ClaudeIcon = ({ size = 24 }: { size?: number }) => (
     <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
       {/* Claude logo SVG path */}
     </svg>
   );
   ```
2. Update `webview/src/components/BlinkingLogo/index.tsx` - replace @lobehub/icons import
3. Update `webview/src/components/ChatInputBox/selectors/ProviderSelect.tsx` - replace import
4. Remove `@lobehub/icons` from `webview/package.json`
5. Run `cd webview && npm install`
6. Run `cd webview && npm run build` - must pass

**Commit:** `chore: replace @lobehub/icons with inline Claude SVG`

---

### A2: Remove sql.js and cc-switch import feature

**Pre-check:** Verify `sql.js` exists in ai-bridge/package.json

**Files to delete:**
- `ai-bridge/read-cc-switch-db.js`

**Files to modify:**
- `ai-bridge/package.json` - remove sql.js dependency
- `src/main/java/.../handler/ProviderHandler.java`:
  - Remove `handlePreviewCcSwitch()` method
  - Remove `handleSelectCcSwitchFile()` method
  - Remove related message type handlers
- `src/main/java/.../settings/ProviderManager.java` - remove `parseProvidersFromCcSwitchDb()`
- `webview/src/components/settings/ProviderList/index.tsx`:
  - Remove import button that triggers cc-switch file selection
  - Remove cc-switch badge logic
- `webview/src/components/settings/ProviderList/ImportConfirmDialog.tsx` - simplify or delete
- `webview/src/types/provider.ts` - remove `source?: 'cc-switch'` field
- `webview/src/components/settings/ConfigInfoDisplay/index.tsx` - remove cc-switch tag

**Post-check:**
```bash
cd ai-bridge && npm install
cd webview && npm run build
./gradlew clean compileJava
```

**Commit:** `chore: remove sql.js and cc-switch import feature`

---

### A3: Remove vconsole

**Pre-check:** Verify `vconsole` exists in webview/package.json

**Files to modify:**
- `webview/package.json` - remove vconsole
- `webview/src/main.tsx` - remove vconsole import and initialization block
- `build.gradle` - remove VITE_ENABLE_VCONSOLE environment variable

**Post-check:**
```bash
cd webview && npm install && npm run build
```

**Commit:** `chore: remove vconsole dependency`

**After A3 complete:** Update GLOBAL_SIMPLIFICATION_STATE.md → `PHASE: C`

---

## Phase C: DEAD CODE REMOVAL

### C1: Delete CollapsibleMarkdownBlock.tsx

**Pre-check:** Grep for imports - must be unused
```bash
grep -r "CollapsibleMarkdownBlock" webview/src --include="*.tsx" --include="*.ts"
```
If imported anywhere, do NOT delete - mark with ⚠️ and move on.

**Action:** Delete `webview/src/components/CollapsibleMarkdownBlock.tsx`

**Commit:** `chore: delete unused CollapsibleMarkdownBlock component`

---

### C2: Remove duplicate copyToClipboard

**Pre-check:** Verify both exist:
- `webview/src/utils/helpers.ts` has copyToClipboard
- `webview/src/utils/copyUtils.ts` exists

**Steps:**
1. Find all imports of copyToClipboard from helpers.ts
2. Update to import from copyUtils.ts
3. Remove copyToClipboard from helpers.ts

**Post-check:** `cd webview && npm run build`

**Commit:** `chore: consolidate copyToClipboard into copyUtils`

---

### C3: Delete unused hasHandlerFor method

**Pre-check:** Grep for usage
```bash
grep -r "hasHandlerFor" src/main/java --include="*.java"
```
If called anywhere besides its definition, do NOT delete.

**Action:** Remove `hasHandlerFor()` method from MessageDispatcher.java

**Commit:** `chore: remove unused hasHandlerFor method`

---

### C4: Delete read-cc-switch-db.js

**Note:** If completed in A2, skip this task.

**Pre-check:** Verify file is never imported
```bash
grep -r "read-cc-switch-db" ai-bridge --include="*.js"
```

**Action:** Delete `ai-bridge/read-cc-switch-db.js`

**Commit:** `chore: delete unused read-cc-switch-db.js`

---

### C5: Inline permission-mapper.js logic

**Pre-check:** Count lines and usages
```bash
wc -l ai-bridge/permission-mapper.js
grep -r "permission-mapper" ai-bridge --include="*.js"
```

**Steps:**
1. Read permission-mapper.js - identify core logic (should be ~4 lines)
2. Find where it's imported (likely permission-handler.js)
3. Inline the logic directly
4. Delete permission-mapper.js

**Post-check:** `cd ai-bridge && npm test`

**Commit:** `chore: inline permission-mapper logic and delete file`

---

### C6: Evaluate session-state.js

**Pre-check:** Check if used
```bash
grep -r "session-state" ai-bridge --include="*.js"
```

**If unused:** Delete file
**If used:** Skip task, mark as ⚠️

**Commit:** `chore: delete unused session-state.js` (if deleted)

**After C6 complete:** Update GLOBAL_SIMPLIFICATION_STATE.md → `PHASE: VERIFY`

---

## Phase VERIFY: Final Verification

Run full test suite:
```bash
./scripts/test-all.sh
```

**If passes:** Update state → `PHASE: COMPLETE`

**If fails:**
1. Identify failing tests
2. Fix issues
3. Commit fix: `fix: [description]`
4. Re-run tests
5. Loop until passing

---

## Iteration Rules

1. **ONE task per iteration** - complete fully before moving on
2. **Pre-checks are mandatory** - if pre-check fails, skip task with ⚠️ note
3. **Post-checks before commit** - verify build/tests pass
4. **Always commit** - one commit per task
5. **Update state file** - after each phase transition

## Failure Handling

- **Pre-check fails:** Mark task `⚠️ SKIPPED: [reason]`, move to next
- **Post-check fails:** Fix issue, do NOT move on until passing
- **3+ consecutive failures:** Stop and output: `BLOCKED: [description]`

## State File Format

GLOBAL_SIMPLIFICATION_STATE.md:
```
PHASE: [A|C|VERIFY|COMPLETE]
CURRENT_TASK: [task ID, e.g., A2]
LAST_COMMIT: [commit hash]
SKIPPED: [list of skipped tasks with reasons]
```

---

## Files Created

- GLOBAL_SIMPLIFICATION_PROMPT.md (this file)
- GLOBAL_SIMPLIFICATION_STATE.md (state tracking)
- webview/src/assets/ClaudeIcon.tsx (created in A1)
