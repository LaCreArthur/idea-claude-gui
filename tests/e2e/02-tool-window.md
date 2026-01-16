# Test: Tool Window Opens and Functions

## Purpose
Verify that clicking the Claude GUI button opens the chat interface.

## Prerequisites
- Rider running with Claude GUI plugin
- A project is open

## Steps

1. **Find the Claude GUI button**
   - Look at the right sidebar of Rider
   - Locate the "Claude GUI" tool window button

2. **Click to open**
   - Click the Claude GUI button
   - Wait for the tool window to open

3. **Verify chat interface appears**
   - A panel should slide open on the right side
   - The panel should contain:
     - A text input area at the bottom
     - A send button (or Enter to send)
     - A message area (empty or with welcome text)

4. **Type in the input**
   - Click in the text input area
   - Type "Hello" (don't send yet)
   - Verify the text appears in the input field

5. **Close the tool window**
   - Click the Claude GUI button again (or the X to close)
   - Verify the panel closes

6. **Reopen**
   - Click the Claude GUI button again
   - Verify the panel reopens
   - The text you typed may or may not persist (both are acceptable)

## Expected Result
- Tool window opens and closes smoothly
- Chat interface has input and message areas
- No errors or crashes

## Pass Criteria
- [ ] Tool window opens on click
- [ ] Input field accepts text
- [ ] Tool window closes on second click
- [ ] Tool window reopens successfully
