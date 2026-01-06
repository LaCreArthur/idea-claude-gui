# Fork Evolution Strategy

> Independent fork with periodic upstream syncs

## Core Approach

**Independent Fork with Sync Capability** - Treat as a separate product with periodic upstream integration.

### Merge Strategy (Updated Jan 2026)

Git merge with upstream **is practical** with careful conflict resolution:
- v0.2.2 merged 57 upstream commits successfully
- 15 files required manual resolution (18% conflict rate)
- AI-assisted conflict resolution proved effective

**When to Merge:**
- Major upstream releases (e.g., v0.1.4)
- Critical bug fixes
- Features with high user demand

**Challenges to Expect:**
- i18n files will conflict (fork uses English defaults, upstream uses translation keys)
- Components with different implementations need careful merging
- Duplicate code artifacts require cleanup after merge

---

## Guiding Principles

### 1. Watch, Don't Follow
- Monitor upstream releases for interesting features
- Evaluate each feature for adoption independently
- No obligation to match upstream feature-for-feature

### 2. Two Integration Approaches

**Option A: Full Git Merge** (for major releases)
- Use when upstream has many valuable changes
- Expect ~18% manual conflict rate
- AI agents can assist with conflict resolution
- Clean up duplicate code artifacts after merge

**Option B: AI Cherry-Pick** (for selective features)
- Use when adopting specific features only
- Implement using fork's patterns and standards
- Follow fork's coding standards (English comments, tests, i18n)
- Avoids git-level integration complexity

### 3. Quality Bar
- New features require tests
- Maintain English-first documentation
- Code review before merge

### 4. Own Roadmap
- Prioritize based on fork's user needs, not upstream activity
- Can add features upstream doesn't have
- Can skip features that don't fit

---

## AI Cherry-Pick Process

When adopting an upstream feature:

1. **Understand** - Read upstream's implementation, understand the approach
2. **Evaluate** - Does this fit fork's direction? Is there user demand?
3. **Adapt** - Design implementation using fork's existing patterns
4. **Implement** - Write code following fork standards (English, tested)
5. **Verify** - Ensure it works with fork's architecture

This leverages AI agents' ability to understand code context and translate between codebases without git operations.

---

## Fork Differentiators

What makes this fork distinct:
1. Complete English localization (60+ files)
2. Seamless CLI session authentication
3. Test infrastructure (Vitest + JUnit 5)
4. Code quality fixes (XSS, debug cleanup)

---

## Upstream Monitoring

**Frequency:** Monthly or when planning next release

**Process:**
1. Review upstream releases (not every commit)
2. Note features with user demand
3. Evaluate fit with fork's direction
4. Add to backlog if appropriate

---

## Version Strategy

| Version | Focus |
|---------|-------|
| v0.2.x | Bug fixes, stability, user-reported issues |
| v0.3.0 | Feature release based on user feedback |
| Future | User-driven roadmap |

---

## Feature Backlog

### Implemented Features (v0.2.2)

| Feature | Source | Status | Notes |
|---------|--------|--------|-------|
| Ask User Question | Upstream | **Done** | Full implementation with multi-select, free-form input |
| MCP Server Toggle | Upstream | **Done** | Project-level tracking, visual indicators |
| Slash commands | Upstream | **Done** | `/init`, `/review` integrated |
| IDE language detection | Upstream | **Done** | Auto-localization based on IDE settings |
| ACCEPT_EDITS mode | Upstream | **Done** | Auto-approve file editing for agents |
| macOS Keychain | Upstream | **Done** | Native credential storage |
| PreToolUse hooks | Upstream | **Done** | Unified permission handling |

### Potential Future Features

| Feature | Source | Complexity | Notes |
|---------|--------|------------|-------|
| Custom agents | Upstream | Medium | Prompt injection system |
| Provider management | Upstream | Low | cc-switch config import |

---

*Created: January 2026*
*Last updated: January 6, 2026*
