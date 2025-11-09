# Testing Checklist - Native Chat UI

## Pre-Testing Setup

### In Sigma Workbook:

- [ ] Variable `p_bubble_session_id` exists (Text control)
- [ ] Variable `p_bubble_chat_bot_prompt` exists (Text control)
- [ ] Variable `p_bubble_chat_bot_response` exists (Text control)
- [ ] onLoad plugin is configured to watch `p_bubble_chat_bot_prompt`
- [ ] Action sequence reads from `p_bubble_chat_bot_prompt`
- [ ] Action sequence writes AI response to `p_bubble_chat_bot_response`

### In Mobile App:

```bash
cd /Users/ram/Documents/Sandbox/mobile-main
npx expo start
```

Open on iPhone via Expo Go.

## Test 1: Modal Opens

**Steps:**
1. Navigate to Conversational AI screen in app
2. In Sigma workbook, update `p_bubble_session_id` (e.g., button that sets it to "test-123")
3. Watch mobile app

**Expected:**
- ✅ Native chat modal slides up from bottom
- ✅ Console logs: `"💬 SessionId changed to: test-123"`
- ✅ Modal shows empty chat with input field

**If it fails:**
- Check mobile app console for errors
- Verify `p_bubble_session_id` is the exact variable name
- Check DashboardView logs for variable change detection

---

## Test 2: Send Message to Sigma

**Steps:**
1. With chat modal open, type "Hello" in the input
2. Click Send button
3. Watch Sigma workbook console

**Expected:**
- ✅ Message appears in chat as user message (blue bubble)
- ✅ Mobile console logs: `"🚀 Sending chat prompt to Sigma: Hello"`
- ✅ Sigma console shows `p_bubble_chat_bot_prompt` updated to "Hello"
- ✅ onLoad plugin triggers action sequence
- ✅ Typing indicator (dots) appears in chat

**If it fails:**
- Check that `p_bubble_chat_bot_prompt` exists in Sigma
- Verify onLoad plugin is watching that variable
- Check that FiresOnLoad checkbox is enabled
- Look for JavaScript errors in Sigma console

---

## Test 3: Receive Response from Sigma

**Steps:**
1. After sending message, wait for action sequence to complete
2. Action sequence should update `p_bubble_chat_bot_response` with AI response
3. Watch mobile app chat

**Expected:**
- ✅ Typing indicator disappears
- ✅ AI response appears in chat (gray bubble)
- ✅ Mobile console logs: `"💬 Chat response received from variable: ..."`
- ✅ Mobile console logs: `"💬 Adding assistant message to chat: ..."`
- ✅ Response text is displayed correctly

**If it fails:**
- Verify action sequence has "Set control value" step
- Check that step sets `p_bubble_chat_bot_response` to the AI response text
- Verify the response text is not empty
- Check mobile console for variable change detection
- Manually update `p_bubble_chat_bot_response` in Sigma to test

---

## Test 4: Multi-Turn Conversation

**Steps:**
1. Send another message: "Tell me more"
2. Wait for response
3. Repeat a few times

**Expected:**
- ✅ All messages appear in correct order
- ✅ User messages (blue) and AI messages (gray) alternate
- ✅ Chat auto-scrolls to bottom
- ✅ No duplicate messages
- ✅ Timestamps are correct

**If it fails:**
- Check for message ID conflicts
- Verify auto-scroll is working
- Check for race conditions in variable updates

---

## Test 5: Close and Reopen

**Steps:**
1. Close the chat modal (swipe down or tap X)
2. In Sigma, change `p_bubble_session_id` to a new value (e.g., "test-456")
3. Modal should reopen

**Expected:**
- ✅ Modal closes smoothly
- ✅ Modal reopens with empty chat (new session)
- ✅ Previous messages are not shown
- ✅ Can send new messages

---

## Common Issues & Solutions

### Modal doesn't open
```
Check: p_bubble_session_id variable name
Check: Variable is being updated in Sigma
Look for: "💬 SessionId changed to: ..." in logs
```

### Message doesn't send
```
Check: p_bubble_chat_bot_prompt variable name
Check: onLoad plugin configuration
Look for: "🚀 Sending chat prompt to Sigma: ..." in logs
```

### Response doesn't appear
```
Check: Action sequence updates p_bubble_chat_bot_response
Check: Response text is not empty
Look for: "💬 Chat response received from variable: ..." in logs
Look for: "💬 Adding assistant message to chat: ..." in logs
```

### Multiple messages appear
```
Issue: Variable might be triggering multiple times
Solution: Check action sequence logic, ensure it only runs once per prompt
```

---

## Debug Mode

To see all postMessage events, check the mobile console for:
```
🔔 ===== POSTMESSAGE RECEIVED =====
📦 Raw message data: ...
✅ Parsed message: ...
📋 Message type: ...
```

All variable changes will show as:
```
📊 Variable changes detected: ...
```

---

## Success Criteria

All tests pass when:
- [x] Modal opens on sessionId change
- [x] User can send messages
- [x] Messages reach Sigma workbook
- [x] AI responses appear in chat
- [x] Multi-turn conversation works
- [x] No errors in console
- [x] UI is smooth and responsive

---

## Next Steps After Testing

1. If all tests pass → Commit changes to git
2. If issues found → Document them and debug
3. Once stable → Consider adding features:
   - Session history loading
   - Model/personality selectors
   - Message editing/deletion
   - Copy message functionality

