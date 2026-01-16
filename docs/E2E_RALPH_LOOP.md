# E2E Testing - AI-Driven Approach

## Status: COMPLETE

The E2E testing migration is complete. Key deliverables:

| Deliverable | Location |
|-------------|----------|
| Natural language tests | `tests/e2e/*.md` |
| Build verification | `src/test/kotlin/.../e2e/BuildVerificationTest.kt` |
| AI automation learnings | `docs/AI_AUTOMATION_LEARNINGS.md` |
| Global learnings | `~/.claude/learnings/AI_AUTOMATION_LEARNINGS.md` |

## Run Tests

```bash
./gradlew testE2E          # Fast build verification (16s)
./scripts/run-e2e.sh       # AI-driven E2E (requires Rider)
```

## Key Learnings

1. **Keyboard > Mouse** - Use `Cmd+Shift+A` for Rider navigation
2. **Verify after actions** - Always screenshot to confirm
3. **cliclick syntax** - `kd:cmd,shift t:a ku:cmd,shift` for modifiers

See `docs/AI_AUTOMATION_LEARNINGS.md` for full details.
