# Ralph Loop Iteration

You are in a Ralph Loop - an autonomous, self-improving iteration system.

## Context Loading (Do This First)

Read these files to understand your mission:
1. `.ralph/epic.md` - The overall goal
2. `.ralph/task.md` - Current task to complete
3. `.ralph/scratchpad.md` - Notes from previous iterations (includes assumption tracking)
4. **`LEARNINGS.md` - Contains reusable patterns and efficiencies discovered in past iterations. Apply relevant learnings to avoid repeating mistakes.**
5. Reference docs mentioned in epic/task (e.g., handoff docs, bug reports)

## Your Mission This Iteration

1. **Re-anchor**: Read the files above to understand context
2. **Verify**: Check assumptions before implementing (see Gate 5)
3. **Execute**: Make progress on the current task
4. **Reflect**: Update scratchpad with findings
5. **Mutate**: Update plan if discoveries invalidate it
6. **Learn**: Add any reusable insights to LEARNINGS.md

## Completion Gates

Before ending this iteration, you MUST:

### Gate 1: Progress Check
- [ ] Made measurable progress on task.md
- [ ] Or documented why blocked (with specific blocker)

### Gate 2: Scratchpad Update (handoff to next iteration)
Update `.ralph/scratchpad.md` to help your next iteration hit the ground running:
- Current status (what's done, what's left)
- What you just tried and the outcome
- What to try next
- Updated assumption tracking

Keep it concise. Preserve useful context, discard noise.

### Gate 3: Efficiency Capture (/Reflect Lite)
If this iteration taught you something genuinely reusable, ask yourself:
- Did I discover a more efficient way to do something?
- Did trial-and-error reveal a pattern worth remembering?
- Did I find a shortcut, gotcha, or non-obvious insight?

If YES to any, add ONE concise entry to `LEARNINGS.md`:
```
[YYYY-MM-DD] #tag: One-liner insight
```

**Constraints (avoid bloat):**
- Max 1 learning per iteration
- Skip if nothing genuinely new was learned
- Focus on efficiency gains, not task-specific notes
- Don't repeat what's already in LEARNINGS.md

### Gate 4: Stuck Detection
If you've tried the same approach 2+ times without progress:
1. Increment stuck_count: `echo $(($(cat .ralph/stuck_count.txt) + 1)) > .ralph/stuck_count.txt`
2. Try a DIFFERENT approach
3. If stuck_count >= 3, trigger research (see Gate 5c) before asking for help

### Gate 5: Discovery-Driven Plan Mutation

**The plan is a hypothesis, not a contract.** Verify before implementing, update when wrong.

#### 5a. Assumption Verification (Before Acting)
Handoffs contain hypotheses, not facts. Before implementing each step:
1. Identify key assumptions in the current task
2. Read the actual code to verify each assumption
3. If assumption is WRONG → update task.md/epic.md BEFORE implementing

Questions to ask:
- "The handoff says X happens at line Y - does it actually?"
- "The handoff says this method is unused - is it really?"
- "The handoff says this is the root cause - what else could it be?"

#### 5b. Discovery Propagation (After Learning)
When you discover something that affects the plan:

| Discovery Type | Action |
|----------------|--------|
| Root cause is different | Update epic.md with correct diagnosis |
| Task is unnecessary | Remove from task.md, note why in scratchpad |
| New task discovered | Add to task.md queue |
| Approach won't work | Update task.md with new approach |
| Assumption was wrong | Update scratchpad tracking, fix affected tasks |
| Scope larger than expected | Note in epic.md, may need to split phases |

#### 5c. Research Trigger
Search online when:
- SDK/API behavior is unclear → search docs
- Error message you don't understand → search
- Best practice question (e.g., "IntelliJ project service pattern") → search
- Stuck > 2 attempts on same approach → research alternatives
- Handoff claims something but you want to verify against docs

After research: update task.md if it changes the approach.

#### 5d. Assumption Tracking
Maintain in `scratchpad.md` under `## Assumptions`:
```
## Assumptions
- [ ] OutputLineProcessor only used by legacy sendMessage (UNVERIFIED)
- [x] bridge.js outputs JSON format (VERIFIED: line 234)
- [!] shouldUseNewBridge() always returns true (WRONG: conditional on line 515)
```

Legend:
- `[ ]` UNVERIFIED - needs checking
- `[x]` VERIFIED - confirmed correct
- `[!]` WRONG - assumption was incorrect, plan updated

Update as you verify. If wrong, immediately update the plan.

## Termination Conditions

Signal completion by outputting exactly:
- `COMPLETION: TASK_DONE` - Current task complete, ready for next
- `COMPLETION: EPIC_DONE` - All tasks complete, epic achieved
- `COMPLETION: BLOCKED` - Cannot proceed, need human input
- `COMPLETION: ITERATION_DONE` - Made progress, continue next iteration
- `COMPLETION: PLAN_UPDATED` - Significant plan change, review before continuing

## Important Rules

1. **Fresh context** - You don't remember previous iterations. READ THE FILES.
2. **State in files** - All important state must be written to files
3. **Verify first** - Check assumptions before implementing
4. **Small steps** - Better to complete one small thing than attempt too much
5. **Test early** - Verify changes work before moving on
6. **Plan is mutable** - Update task.md/epic.md when discoveries warrant it
7. **Research when uncertain** - Don't guess, look it up
