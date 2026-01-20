#!/bin/bash
# Ralph Loop - External bash loop for fresh-context iterations
#
# Usage:
#   ./ralph.sh                                    # Run with defaults
#   MAX_ITERATIONS=20 ./ralph.sh                  # Limit iterations
#   COMPLETION_PROMISE="ALL_TESTS_PASS" ./ralph.sh  # Custom completion
#   RALPH_TEST_CMD="./gradlew test" ./ralph.sh    # Test before commit

set -e

# Configuration
MAX_ITERATIONS=${MAX_ITERATIONS:-100}
COMPLETION_PROMISE=${COMPLETION_PROMISE:-"TASK_DONE"}
RALPH_TEST_CMD=${RALPH_TEST_CMD:-"true"}  # Default: always pass (fast iterations)
RALPH_DIR=".ralph"
ITERATION_FILE="$RALPH_DIR/iteration.txt"
STUCK_FILE="$RALPH_DIR/stuck_count.txt"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Initialize state files if missing
[ -f "$ITERATION_FILE" ] || echo "1" > "$ITERATION_FILE"
[ -f "$STUCK_FILE" ] || echo "0" > "$STUCK_FILE"

# Read current iteration
iteration=$(cat "$ITERATION_FILE")

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║       RALPH LOOP STARTING              ║${NC}"
echo -e "${BLUE}║  Max iterations: $MAX_ITERATIONS                   ║${NC}"
echo -e "${BLUE}║  Completion: $COMPLETION_PROMISE               ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"

while [ "$iteration" -le "$MAX_ITERATIONS" ]; do
    echo ""
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}  ITERATION $iteration / $MAX_ITERATIONS${NC}"
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    # Build the prompt
    prompt="Read .ralph/PROMPT.md and follow its instructions. This is iteration $iteration."

    # Run Claude with fresh context (skip permissions for autonomous operation)
    # Stream output to terminal AND capture for completion detection
    output=$(claude --dangerously-skip-permissions --print "$prompt" 2>&1 | tee /dev/tty) || true

    # Check for completion signals
    should_commit=true
    if echo "$output" | grep -q "COMPLETION: EPIC_DONE"; then
        echo -e "${GREEN}✓ EPIC COMPLETE!${NC}"
        echo "0" > "$STUCK_FILE"
        break
    elif echo "$output" | grep -q "COMPLETION: TASK_DONE"; then
        echo -e "${GREEN}✓ Task complete, continuing to next task...${NC}"
        echo "0" > "$STUCK_FILE"
    elif echo "$output" | grep -q "COMPLETION: BLOCKED"; then
        echo -e "${RED}✗ BLOCKED - Human input required${NC}"
        echo ""
        echo "Review .ralph/scratchpad.md for details"
        should_commit=false
        break
    elif echo "$output" | grep -q "COMPLETION: ITERATION_DONE"; then
        echo -e "${BLUE}→ Iteration complete, continuing...${NC}"
    else
        echo -e "${YELLOW}⚠ No completion signal detected${NC}"
    fi

    # Commit changes if tests pass (excludes .ralph/ and task_plan.md)
    if [ "$should_commit" = true ]; then
        if eval "$RALPH_TEST_CMD" 2>/dev/null; then
            # Stage all changes except ralph state files
            git add -A -- ':!.ralph/' ':!task_plan.md' 2>/dev/null || true
            # Commit if there are staged changes
            if ! git diff --cached --quiet 2>/dev/null; then
                git commit -m "ralph: iteration $iteration" -q 2>/dev/null || true
                echo -e "${GREEN}✓ Committed iteration $iteration${NC}"
            fi
        else
            echo -e "${YELLOW}⚠ Tests failed, skipping commit${NC}"
        fi
    fi

    # Increment iteration
    iteration=$((iteration + 1))
    echo "$iteration" > "$ITERATION_FILE"

    # Small delay to avoid hammering
    sleep 1
done

if [ "$iteration" -gt "$MAX_ITERATIONS" ]; then
    echo -e "${RED}✗ Max iterations ($MAX_ITERATIONS) reached${NC}"
    echo "Review .ralph/scratchpad.md for progress"
fi

echo ""
echo -e "${BLUE}Ralph Loop ended at iteration $iteration${NC}"
