# Test: Complete Chat Flow

## Purpose
Verify that you can send a message to Claude and receive a response.

## Prerequisites
- Rider running with Claude GUI plugin
- A project is open
- Claude GUI tool window is open
- **Valid Claude API key configured** (or skip if testing UI only)

## Steps

1. **Open Claude GUI**
   - Click the Claude GUI button to open the tool window
   - Wait for the interface to load

2. **Send a simple message**
   - Type in the input: "What is 2 + 2?"
   - Press Enter or click the Send button

3. **Wait for response**
   - Watch for a loading indicator (spinner, dots, etc.)
   - Wait up to 30 seconds for a response
   - If no API key: may see an error about authentication

4. **Verify response**
   - A response should appear in the message area
   - The response should contain "4"
   - The conversation should show both your message and Claude's reply

5. **Send a follow-up**
   - Type: "And what is that times 3?"
   - Send and wait for response

6. **Verify conversation context**
   - The response should reference the previous answer
   - Should contain "12" (since 4 * 3 = 12)

## Expected Result
- Messages send successfully
- Claude responds appropriately
- Conversation context is maintained

## Pass Criteria
- [ ] Input accepts message
- [ ] Message appears in chat after sending
- [ ] Claude responds (or auth error if no API key)
- [ ] Follow-up message shows context awareness

## Notes
- If API key is not configured, the test passes if an appropriate error is shown
- Network errors should display user-friendly messages
