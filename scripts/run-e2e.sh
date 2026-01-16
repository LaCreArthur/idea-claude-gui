#!/bin/bash
# Run E2E tests using Claude Code
#
# This script runs natural language E2E tests by asking Claude Code
# to execute each test spec against the running Rider IDE.
#
# Prerequisites:
# - Rider must be running with Claude GUI plugin installed
# - A project must be open
# - Claude Code CLI must be installed and configured

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TESTS_DIR="$PROJECT_ROOT/tests/e2e"

echo "=========================================="
echo "  Claude GUI E2E Test Runner"
echo "=========================================="
echo ""
echo "Prerequisites:"
echo "  - Rider must be running with plugin installed"
echo "  - A project must be open in Rider"
echo ""
echo "Tests directory: $TESTS_DIR"
echo ""

# Check if tests directory exists
if [ ! -d "$TESTS_DIR" ]; then
    echo "ERROR: Tests directory not found: $TESTS_DIR"
    exit 1
fi

# Count test files
TEST_COUNT=$(ls -1 "$TESTS_DIR"/*.md 2>/dev/null | grep -v README.md | wc -l)
echo "Found $TEST_COUNT test(s) to run"
echo ""

# Run each test
PASSED=0
FAILED=0

for test_file in "$TESTS_DIR"/[0-9]*.md; do
    if [ ! -f "$test_file" ]; then
        continue
    fi

    test_name=$(basename "$test_file" .md)
    echo "=========================================="
    echo "Running: $test_name"
    echo "=========================================="

    # Read test content
    test_content=$(cat "$test_file")

    # Execute test via Claude Code
    # The --print flag outputs the result without interactive mode
    if command -v claude &> /dev/null; then
        echo ""
        echo "Executing test via Claude Code..."
        echo ""

        # Create a prompt that instructs Claude to execute the test
        prompt="Execute this E2E test against the running Rider IDE.
Take screenshots to verify each step.
Report PASS or FAIL with details.
Use the computer (screenshots, mouse, keyboard) to interact with Rider.

Test specification:
$test_content"

        # Run Claude and capture result
        if claude --print "$prompt" 2>/dev/null; then
            echo ""
            echo "Test completed."
            ((PASSED++)) || true
        else
            echo ""
            echo "Test execution failed or returned error."
            ((FAILED++)) || true
        fi
    else
        echo "WARNING: 'claude' CLI not found. Run test manually."
        echo ""
        echo "Test steps:"
        echo "$test_content"
        echo ""
    fi

    echo ""
done

echo "=========================================="
echo "  Results"
echo "=========================================="
echo "Passed: $PASSED"
echo "Failed: $FAILED"
echo "Total:  $TEST_COUNT"
echo ""

if [ $FAILED -gt 0 ]; then
    exit 1
fi
