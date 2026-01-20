# Ralph Loop: Self-Improving Codebase Cleanup

**Created:** 2026-01-20  
**Purpose:** Autonomous codebase improvement with assumption validation and research checkpoints

---

## 🎯 What is This?

A self-improving iteration loop that executes the audit recommendations while:
- **Validating assumptions** before acting (no blind trust in grep results)
- **Checking online docs** for best practices (2026-current approaches)
- **Reevaluating the plan** based on discoveries
- **Extracting learnings** to improve future iterations
- **Meta goal:** Make codebase cleaner, fewer bugs, more maintainable for Claude Code

---

## 🚀 Quick Start

### 1. Start the Ralph Loop

```bash
# From project root
./ralph.sh
```

**What happens:**
- Ralph reads `.ralph/PROMPT.md` each iteration
- Executes the 6-phase protocol
- Commits changes automatically if tests pass
- Continues until all tasks done or max iterations (100) reached

### 2. Optional: Configure

```bash
# Run with custom settings
MAX_ITERATIONS=50 ./ralph.sh                       # Limit iterations
RALPH_TEST_CMD="./gradlew test" ./ralph.sh         # Run tests before commit
COMPLETION_PROMISE="EPIC_DONE" ./ralph.sh          # Custom completion target
```

### 3. Monitor Progress

```bash
# Check current state
cat .ralph/scratchpad.md

# View assumptions validation
cat .ralph/assumptions.md

# Check iteration count
cat .ralph/iteration.txt
```

---

## 🔄 The 6-Phase Self-Improving Protocol

### Phase 1: ASSUMPTION VALIDATION

**Before executing any task:**

1. List assumptions explicitly (in `.ralph/assumptions.md`)
2. Verify each assumption (read code, don't trust grep)
3. Mark as ✅ VERIFIED, ❌ INVALIDATED, or ? INFERRED

**Example:**
```markdown
### A4.1: SessionLoadService.clearListener() never called
Status: ? INFERRED (from tldr dead output)
Verification: Grep for all usages → Read calling files → Check git history
Result: ✅ VERIFIED - No calls found in 3 years
```

### Phase 2: RESEARCH CHECKPOINT

**Check if docs/best practices have changed:**

- IntelliJ Platform SDK (2026 docs)
- Claude Agent SDK (latest changelog)
- Java/Kotlin patterns (current best practices)
- TypeScript/React patterns (2026 approaches)

**Research commands:**
```bash
# External research via oracle agent
Task tool: subagent_type="oracle"
Prompt: "What's the current best practice for [TOPIC] in IntelliJ plugins 2026?"

# Web search for docs
WebSearch: "IntelliJ Platform SDK @Service annotation 2026"
```

### Phase 3: PLAN REEVALUATION

**Based on research findings:**

- Does the original recommendation still make sense?
- Is there a simpler approach? (Investigate Before Complexity)
- Will this make the codebase more Claude Code-friendly?

**If plan changes:**
- Update `.ralph/scratchpad.md`
- Document why in assumptions.md
- Adjust task queue priority

### Phase 4: EXECUTION

**Make the smallest possible change:**

1. ONE change at a time (not multiple files/features)
2. Test immediately (unit tests, smoke tests)
3. Commit if successful (ralph.sh handles this)
4. Document what worked/didn't work

**Test commands:**
```bash
# Quick tests
npm test --prefix webview -- --run
npm test --prefix ai-bridge -- --run

# Full suite
./scripts/test-all.sh

# Build verification
./gradlew clean buildPlugin
```

### Phase 5: META-LEARNING

**Extract learnings for future iterations:**

**Learning template:**
```markdown
## Learning: Remove Dead Code - SessionLoadService

**Assumption:** Function was never called
**Reality:** Confirmed via git history - added in 2024, never used
**Discovery:** Was planned for multi-tab feature that got cancelled
**Impact:** Similar placeholder functions likely exist elsewhere
**For Claude Code:** Fewer unused symbols = less confusion when searching
```

**Store in memory:**
```bash
cd $CLAUDE_OPC_DIR && PYTHONPATH=. uv run python scripts/core/store_learning.py \
  --session-id "ralph-cleanup" \
  --type WORKING_SOLUTION \
  --content "SessionLoadService.clearListener() was dead code from cancelled feature" \
  --context "idea-claude-gui dead code removal" \
  --tags "ralph,cleanup,dead-code" \
  --confidence high
```

### Phase 6: ITERATION SIGNAL

**End iteration with completion signal:**

- `COMPLETION: ITERATION_DONE` - Continue next iteration
- `COMPLETION: TASK_DONE` - Move to next task
- `COMPLETION: EPIC_DONE` - All recommendations complete
- `COMPLETION: BLOCKED` - Human input needed

---

## 📋 Task Queue (Priority Order)

### P0 - Critical Bugs (Production Blocking)
1. ✅ PermissionService Singleton - COMPLETED (v0.2.10)
2. ⏸️ Image Attachments - CLAIMED FIXED (needs verification)

### P1 - High Priority (Code Health)
3. ⏳ Expand Test Suite - IN PROGRESS
4. ⏳ Remove Dead Code - IDENTIFIED
5. ⏳ Remove Chinese Comments - PARTIAL

### P2 - Medium Priority (Maintainability)
6. ⏳ Gate Debug Logging - PLANNED
7. ⏳ Reduce Large Files - IDENTIFIED
8. ⏳ Add CI/CD Checks - PARTIAL

---

## 🎓 What Makes This Self-Improving?

### 1. Assumption Validation Loop

**Traditional approach:**
```
Recommendation → Execute → Hope it works
```

**Ralph loop:**
```
Recommendation → List assumptions → Verify assumptions → Adjust plan → Execute
```

**Result:** Fewer false starts, better understanding of codebase

### 2. Research Checkpoint Loop

**Traditional approach:**
```
Use approach I remember from last year
```

**Ralph loop:**
```
Check if docs changed → Found new best practice → Update approach
```

**Result:** Always uses current best practices, not outdated patterns

### 3. Plan Reevaluation Loop

**Traditional approach:**
```
Follow plan rigidly, even if discoveries show better way
```

**Ralph loop:**
```
Discover simpler approach → Update plan → Execute new approach
```

**Result:** Adapts to new information, finds simplest solutions

### 4. Meta-Learning Loop

**Traditional approach:**
```
Fix bug → Move on → Repeat same mistake later
```

**Ralph loop:**
```
Fix bug → Extract pattern → Store learning → Apply to future tasks
```

**Result:** Learns from experience, improves over time

---

## 🔍 Example: Dead Code Removal with Self-Improvement

### Iteration 1: Initial Assumption

**Task:** Remove `SessionLoadService.clearListener()`

**Assumptions (? INFERRED):**
- Function never called
- Safe to remove

**Phase 1: Validation**
```bash
# Don't trust tldr - verify manually
Grep: "clearListener" → 2 results
Read: Both are definition, no calls
Git log: Added 2024-03, never called
Result: ✅ VERIFIED
```

**Phase 2: Research**
```bash
WebSearch: "IntelliJ plugin unused service methods cleanup 2026"
Found: @Deprecated annotation for phasing out
Decision: Use @Deprecated first, remove in next version
Plan adjusted: Add deprecation instead of immediate removal
```

**Phase 3: Reevaluation**
- Original: Delete immediately
- New plan: Mark @Deprecated, remove after deprecation period
- Rationale: Safer if external plugins use it

**Phase 4: Execution**
```java
// Before
public void clearListener() { ... }

// After
@Deprecated(since = "0.2.10", forRemoval = true)
public void clearListener() { ... }
```

**Phase 5: Meta-Learning**
```markdown
## Learning: Deprecation Before Removal

**Assumption:** Can immediately delete unused public methods
**Reality:** Public APIs might have external users
**Discovery:** IntelliJ best practice is @Deprecated first
**Impact:** Apply to all public method removals
**For Claude Code:** Clear deprecation notices help understand migration path
```

**Phase 6: Signal**
```
COMPLETION: TASK_DONE
Removed 1 dead code item with deprecation pattern
Next: Apply pattern to other dead code items
```

### Iteration 2: Apply Learning

**Task:** Remove other dead code items

**Plan adjusted based on learning:**
- Public methods → @Deprecated first
- Private methods → Safe to delete immediately
- Check external usage before marking for removal

**Result:** Faster, safer execution using learned pattern

---

## 📊 Success Metrics

Ralph loop completes when:

### Quantitative Goals
- [ ] File sizes: All <800 lines (current: 3 files >800)
- [ ] Chinese comments: 0 instances (current: >0 in extract-version.mjs)
- [ ] Dead code: 0 unreachable functions (current: 5+ identified)
- [ ] Test coverage: >60% (current: <5%)
- [ ] Debug logging: Gated behind flag (current: always-on)

### Qualitative Goals
- [ ] Codebase easier to search (consistent patterns)
- [ ] Fewer tokens to understand architecture (clearer structure)
- [ ] Less confusion for Claude Code (English-only, explicit)
- [ ] Higher confidence in changes (more tests)

**Measurement commands:**
```bash
# File sizes
find src/main/java -name "*.java" -exec wc -l {} + | sort -rn | head -10

# Chinese characters
grep -r "[\u4e00-\u9fa5]" --include="*.java" --include="*.ts" . 2>/dev/null

# Dead code
tldr dead src/main/java --entry "ClaudeSDKToolWindow"

# Test count
find src/test -name "*Test.java" | wc -l
```

---

## 🛠️ Troubleshooting

### Ralph Loop Stuck

**Symptoms:** Same task for 3+ iterations with no progress

**Check:**
```bash
cat .ralph/scratchpad.md    # What's blocking?
cat .ralph/stuck_count.txt  # How many stuck iterations?
```

**Solutions:**
1. Mark task as `COMPLETION: BLOCKED` with reason
2. Skip to next task manually in scratchpad
3. Adjust max iterations: `MAX_ITERATIONS=5 ./ralph.sh`

### Tests Failing

**Symptoms:** Ralph commits nothing, tests always fail

**Check:**
```bash
./scripts/test-all.sh  # Run tests manually
echo $RALPH_TEST_CMD   # Check what test command Ralph uses
```

**Solutions:**
1. Fix tests first before continuing Ralph
2. Use simpler test: `RALPH_TEST_CMD="true" ./ralph.sh` (skip tests)
3. Check .ralph/scratchpad.md for test output

### Assumptions Not Validating

**Symptoms:** Multiple assumptions marked ? INFERRED, not progressing

**Solutions:**
1. Read the actual files (don't rely on grep)
2. Check git history for context
3. Test the behavior manually
4. Mark as ❌ INVALIDATED if can't verify, adjust plan

---

## 📚 File Structure

```
.ralph/
├── PROMPT.md          # Main instructions (read each iteration)
├── scratchpad.md      # Current state, progress tracking
├── assumptions.md     # Assumption validation log
├── iteration.txt      # Current iteration number
└── stuck_count.txt    # Stuck detection counter

ralph.sh               # Bash loop executor
RALPH_INIT.md          # This file (usage guide)
```

---

## 🔄 Workflow Summary

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Ralph reads .ralph/PROMPT.md                             │
│ 2. Claude reads .ralph/scratchpad.md for current task       │
│ 3. Validate assumptions (Phase 1)                           │
│ 4. Research best practices (Phase 2)                        │
│ 5. Reevaluate plan (Phase 3)                                │
│ 6. Execute smallest change (Phase 4)                        │
│ 7. Extract learnings (Phase 5)                              │
│ 8. Emit completion signal (Phase 6)                         │
│ 9. Ralph commits if tests pass                              │
│ 10. Increment iteration, loop back to step 1                │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎯 Ready to Start?

```bash
# Initialize (if not already done)
git add .ralph/
git commit -m "ralph: Initialize self-improving cleanup loop"

# Start Ralph
./ralph.sh

# Or with options
MAX_ITERATIONS=20 RALPH_TEST_CMD="./gradlew test" ./ralph.sh
```

**First iteration will:**
1. Read scratchpad (currently: "Pick first task")
2. Choose next task from queue (likely "Verify Image Attachments")
3. Validate assumptions about image attachment bug
4. Research Claude SDK image handling
5. Test with actual image files
6. Document findings
7. Emit `TASK_DONE` or `ITERATION_DONE`

**Monitor:**
```bash
# Watch progress
tail -f .ralph/scratchpad.md

# Check commits
git log --oneline | grep ralph:
```

---

**Meta Goal:** Cleaner codebase, fewer bugs, more maintainable for Claude Code ✨
