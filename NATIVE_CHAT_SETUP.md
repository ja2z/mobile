# Native Chat UI - Sigma Workbook Setup Guide

This guide explains how to configure your Sigma workbook to work with the native mobile chat interface.

## Overview

The native chat UI communicates with the Sigma workbook via postMessage. The flow is:

1. User sends message in native app → App posts message to update `c_prompt-1` variable
2. onLoad plugin detects variable change → Triggers action sequence
3. Action sequence writes to chat history table and calls AI API
4. Sigma sends response back to app → App displays in native chat

## Required Sigma Components

### 1. Variables (Controls)

Create the following variables in your Sigma workbook:

#### a. `p_bubble_chat_bot_prompt` (Text Control)
- **Type**: Text
- **Purpose**: Receives user prompts from the native app
- **Configuration**: 
  - Name: `p_bubble_chat_bot_prompt`
  - Type: Text
  - Default Value: (empty string)

#### b. `p_bubble_session_id` (Text Control)
- **Type**: Text
- **Purpose**: When this changes, it triggers the native chat modal to open
- **Configuration**:
  - Name: `p_bubble_session_id`
  - Type: Text
  - Default Value: (empty string or initial session ID)

#### c. `p_bubble_chat_bot_response` (Text Control) - **REQUIRED**
- **Type**: Text
- **Purpose**: Sends AI responses back to the native app
- **Configuration**:
  - Name: `p_bubble_chat_bot_response`
  - Type: Text
  - Default Value: (empty string)
- **Important**: Your action sequence must update this control with the AI response

### 2. onLoad Action Plugin

You should already have the onLoad action plugin configured. Ensure:

- One of the variable controls (e.g., **var2Control**) is set to `p_bubble_chat_bot_prompt`
- The corresponding **FiresOnLoad checkbox** is checked (enabled)
- The corresponding **onVarChangeAction** is connected to your chat action sequence

### 3. Action Sequence

Your existing action sequence should:

1. Read the prompt from `p_bubble_chat_bot_prompt`
2. Insert user message into chat history table
3. Call your AI API (with the prompt)
4. Insert AI response into chat history table
5. **CRITICAL**: Update `p_bubble_chat_bot_response` control with the AI response text

#### Updating the Response Control (Required)

At the end of your action sequence, add an action step:

1. **Action Type**: "Set control value"
2. **Control**: `p_bubble_chat_bot_response`
3. **Value**: The AI response text (from your API call or database)

The native app listens for `workbook:variables:onchange` events. When `p_bubble_chat_bot_response` changes, the app will automatically:
- Detect the change
- Extract the response text
- Display it in the native chat UI

**Example Action Sequence:**
```
Step 1: Insert row → Chat History Table (user message)
Step 2: Call API → Your AI endpoint
Step 3: Insert row → Chat History Table (AI response)
Step 4: Set control value → p_bubble_chat_bot_response = [AI response text]
```

**Note**: The app uses Sigma's built-in `workbook:variables:onchange` event, so no custom plugin is needed!

## PostMessage Protocol

### Messages FROM Sigma TO App

The app listens for Sigma's standard `workbook:variables:onchange` event:

```json
{
  "type": "workbook:variables:onchange",
  "workbook": {
    "variables": {
      "p_bubble_session_id": "session-123",
      "p_bubble_chat_bot_response": "This is the AI response text"
    }
  }
}
```

**What the app does:**
- When `p_bubble_session_id` changes → Opens the native chat modal
- When `p_bubble_chat_bot_response` changes → Displays the AI response in chat

### Messages FROM App TO Sigma

The app sends Sigma's standard variable update message:

```json
{
  "type": "workbook:variables:update",
  "variables": {
    "p_bubble_chat_bot_prompt": "User's message here"
  }
}
```

**What happens in Sigma:**
- `p_bubble_chat_bot_prompt` is updated
- onLoad plugin detects the change
- Your action sequence is triggered

## Testing the Integration

### 1. Test Variable Update
- Open the mobile app
- Navigate to Conversational AI screen
- Open browser console on your development machine
- You should see logs when the app connects to the workbook

### 2. Test Chat Open
- In Sigma workbook, create a button that updates the `p_bubble_session_id` variable
- Click the button
- Native chat modal should slide up on the mobile app

### 3. Test Message Sending
- Type a message in the native chat
- Click Send
- Check Sigma console logs to see if `p_bubble_chat_bot_prompt` was updated
- Check if onLoad plugin triggered the action sequence

### 4. Test Response Receiving
- After action sequence completes, check that `p_bubble_chat_bot_response` was updated
- Response should appear in the native chat automatically
- Check mobile app logs for: `"💬 Chat response received from variable: ..."`

## Troubleshooting

### Chat Modal Doesn't Open
- Check that `p_bubble_session_id` variable exists in workbook
- Check browser console for postMessage logs
- Verify DashboardView is logging: `"💬 SessionId changed to: ..."`
- Try manually updating the variable in Sigma to test

### Messages Not Sending
- Check that `p_bubble_chat_bot_prompt` variable exists
- Check that onLoad plugin is watching `p_bubble_chat_bot_prompt`
- Check that the FiresOnLoad checkbox is enabled
- Look for logs: `"🚀 Sending chat prompt to Sigma: ..."`
- Check Sigma console to see if variable was updated

### Responses Not Showing
- Verify action sequence has a "Set control value" step for `p_bubble_chat_bot_response`
- Check that the control is being updated with the AI response text
- Look for mobile app logs: `"💬 Chat response received from variable: ..."`
- Look for mobile app logs: `"💬 Adding assistant message to chat: ..."`
- Check that the response text is not empty

## Current Limitations (v1)

- No session history retrieval (each open is a new session)
- No model/personality selectors
- No recents list
- Responses timeout after 30 seconds (configurable in Config.ts)

## Configuration

Variable names are configured in `/constants/Config.ts`:

```typescript
CHAT: {
  PROMPT_VARIABLE: 'p_bubble_chat_bot_prompt',
  RESPONSE_VARIABLE: 'p_bubble_chat_bot_response',
  SESSION_ID_VARIABLE: 'p_bubble_session_id',
  RESPONSE_TIMEOUT: 30000, // 30 seconds
}
```

These match your Sigma workbook control names. If you need to use different variable names, update this configuration.

## Future Enhancements

- Load chat history when modal opens
- Support for message editing/deletion
- Copy message functionality
- Voice input
- Model and personality selectors
- Recent conversations list

