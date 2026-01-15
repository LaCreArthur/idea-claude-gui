# Codebase Simplification - Ralph Loop Prompt

## Current Phase
Check SIMPLIFICATION_STATE.md to determine current phase. If file doesn't exist, start at Phase 1.

---

## Phase 1: PLANNING

### Step 1.1: Launch Planning Agents
Launch TWO code-simplifier agents IN PARALLEL (single message, multiple Task tool calls):

**Agent A - i18n Removal Planning:**
Explore the codebase and create a detailed plan to remove all i18n/internationalization support.
Find: locale files, i18n utilities, translation function usages, build config.
Write detailed checklist to: .claude/i18n-removal-plan.md

**Agent B - LLM Cleanup Planning:**
Explore the codebase and create a detailed plan to remove all non-Claude LLM support.
Find: LLM provider abstractions, non-Claude implementations, LLM selection UI, config.
Write detailed checklist to: .claude/llm-cleanup-plan.md

### Step 1.2: Merge Plans
After both agents complete:
1. Read .claude/i18n-removal-plan.md
2. Read .claude/llm-cleanup-plan.md
3. Create SIMPLIFICATION_PLAN.md with merged task list:
   - Use checkbox format: - [ ] Task description
   - Order by dependency (modify before delete, children before parents)
   - Group by category (i18n, LLM, verification)

### Step 1.3: Transition to Phase 2
Write to SIMPLIFICATION_STATE.md: "PHASE: 2 - EXECUTION"

---

## Phase 2: EXECUTION

### Each Iteration:
1. Read SIMPLIFICATION_PLAN.md
2. Find FIRST unchecked task (- [ ])
3. Execute that task completely:
   - For deletions: Delete the file(s)
   - For i18n: Replace translation calls with English strings directly
   - For LLM: Remove non-Claude code, keep Claude Code functionality
   - Run relevant tests if quick
4. Mark task complete: - [x] Task description ✓
5. Commit: `git add -A && git commit -m "chore: [brief task description]"`
6. If ALL tasks checked → Write to SIMPLIFICATION_STATE.md: "PHASE: 3 - REVIEW"

### Rules:
- ONE task per iteration
- ALWAYS commit after each task
- If task fails, mark with ⚠️ and note, move to next
- Preserve English strings when removing i18n
- Keep Claude Code fully functional

---

## Phase 3: REVIEW

### Step 3.1: Launch Review Agents
Launch TWO code-simplifier agents IN PARALLEL:

**Reviewer A - Code Quality:**
Review changes since simplification started (use git log/diff).
Check for: dead code, unused imports, broken references, test gaps.
Write findings to: .claude/review-a.md

**Reviewer B - Consistency & Build:**
Review changes since simplification started.
Check for: naming consistency, build errors, runtime issues.
Write findings to: .claude/review-b.md

### Step 3.2: Fix Issues
After both reviewers complete:
1. Read both review files
2. If issues found: fix them and commit
3. Run full test suite: ./scripts/test-all.sh
4. If tests pass → proceed to completion

### Step 3.3: Complete
Output: <promise>SIMPLIFICATION COMPLETE</promise>

---

## State Tracking

SIMPLIFICATION_STATE.md format:
```
PHASE: [1|2|3] - [PLANNING|EXECUTION|REVIEW]
ITERATION: [number]
LAST_ACTION: [description]
```

---

## Files Created During Execution
- SIMPLIFICATION_PROMPT.md (this file - create before starting)
- SIMPLIFICATION_STATE.md (state tracking)
- SIMPLIFICATION_PLAN.md (merged task list)
- .claude/i18n-removal-plan.md (Agent A planning output)
- .claude/llm-cleanup-plan.md (Agent B planning output)
- .claude/review-a.md (Reviewer A findings)
- .claude/review-b.md (Reviewer B findings)
