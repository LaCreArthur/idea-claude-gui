# Fork Evolution Strategy

> Independent fork with AI-assisted feature adoption

## Core Approach

**Independent Fork** - Treat as a separate product, not a tracking fork.

Git merge with upstream is impractical due to:
- 60+ localized files would conflict
- Different coding standards (English vs Chinese comments)
- Different quality bar (tests required)
- Different priorities

---

## Guiding Principles

### 1. Watch, Don't Follow
- Monitor upstream releases for interesting features
- Evaluate each feature for adoption independently
- No obligation to match upstream feature-for-feature

### 2. Implement, Don't Merge (AI Cherry-Pick)
- Use AI agents to understand upstream's solution
- Implement using fork's patterns and standards
- Follow fork's coding standards (English comments, tests, i18n)
- Avoid git-level integration entirely

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

Potential features to adopt when users request them:

| Feature | Source | Complexity | Status | Priority |
|---------|--------|------------|--------|----------|
| ~~Ask User Question~~ | ~~Upstream~~ | ~~Medium~~ | ✅ **Implemented in v0.2.1** | - |
| ~~MCP Server Toggle~~ | ~~Upstream~~ | ~~Low~~ | ✅ **Implemented in v0.2.1** | - |
| ACCEPT_EDITS Mode | Upstream | Medium | 📋 Planned for v0.3.0 | ⭐⭐⭐ HIGH |
| IDE Language Detection | Upstream | Low | 📋 Planned for v0.3.0 | ⭐⭐⭐ HIGH |
| macOS Keychain Support | Upstream | Low | 📋 Planned for v0.3.0 | ⭐⭐ MEDIUM |
| Slash commands (/init, /review) | Upstream | Low | ⏸️ Deferred | ⭐ LOW |

---

## Upstream Evaluations

| Date | Period Covered | Features Adopted | Document |
|------|----------------|------------------|----------|
| Jan 2026 | Dec 2025 - Jan 2026 | 3 features planned for v0.3.0 | [UPSTREAM_EVALUATION_2026_01.md](UPSTREAM_EVALUATION_2026_01.md) |

Next evaluation: **February 2026** or when planning v0.4.0

---

*Created: January 2026*
*Last updated: January 5, 2026*
