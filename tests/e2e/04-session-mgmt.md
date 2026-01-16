# Test: Session Management

## Purpose
Verify that users can create, switch between, and manage multiple chat sessions.

## Prerequisites
- Rider running with Claude GUI plugin
- Claude GUI tool window is open

## Steps

1. **Open Claude GUI**
   - Click the Claude GUI button to open the tool window

2. **Find session controls**
   - Look for session management UI (usually at the top of the chat)
   - There should be a way to:
     - See the current session name
     - Create a new session
     - Switch between sessions (if multiple exist)

3. **Create a new session**
   - Click "New Session" or "+" button
   - A new session should be created
   - The chat area should clear or show a new conversation

4. **Name a session (if supported)**
   - If there's an option to rename, try renaming the session
   - The name should update in the session list

5. **Switch sessions (if multiple exist)**
   - If you can see multiple sessions, click a different one
   - The chat should switch to that session's conversation

6. **Delete a session (if supported)**
   - If there's a delete option, try deleting an empty session
   - The session should be removed from the list
   - Should not delete if it's the only session (or create a new one)

## Expected Result
- Session creation works
- Switching between sessions shows different conversations
- Session management is intuitive

## Pass Criteria
- [ ] Can create new session
- [ ] New session has empty/fresh chat
- [ ] Can switch between sessions (if multiple exist)
- [ ] Delete removes session from list

## Notes
- Session management UI varies by implementation
- Some features may not be available yet
- Mark as partial pass if core features work
