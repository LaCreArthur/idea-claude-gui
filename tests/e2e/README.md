# E2E Tests - Natural Language Approach

This directory contains E2E test specifications written in natural language markdown.
These tests are designed to be executed by Claude Code (or similar AI assistants) that can
interact with the running IDE via screenshots, mouse, and keyboard.

## How to Run

### Option 1: Interactive with Claude Code
```bash
claude "Run the e2e test in tests/e2e/02-tool-window.md. Rider is running with the plugin."
```

### Option 2: Run All Tests
```bash
./scripts/run-e2e.sh
```

### Option 3: Manual Execution
Read each markdown file and follow the steps manually.

## Prerequisites

1. **Rider 2025.3+** installed
2. **Claude GUI plugin** installed in Rider
3. A test project open in Rider
4. **Claude Code** with computer use capabilities (if running automated)

## Test Files

| File | Description |
|------|-------------|
| `01-plugin-loads.md` | Verify plugin installs and appears in Rider |
| `02-tool-window.md` | Tool window opens, closes, basic interaction |
| `03-chat-flow.md` | Send message, receive response, conversation |
| `04-session-mgmt.md` | Create, switch, delete sessions |

## Why Natural Language Tests?

- **Self-healing**: AI adapts when UI changes slightly
- **Readable**: Anyone can understand and maintain tests
- **Deep coverage**: Tests actual user flows, not just API calls
- **No brittle selectors**: No XPath or CSS that breaks on updates
