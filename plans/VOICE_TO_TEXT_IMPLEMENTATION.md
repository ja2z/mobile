# Voice-to-Text Implementation Summary

## Overview

Voice-to-text in the ChatModal uses **`expo-speech-recognition`**, which wraps iOS `SFSpeechRecognizer`, Android `SpeechRecognizer`, and the Web Speech API for consistent behavior across platforms.

## Implementation Complete ✅

### 1. Dependencies

- **Package**: [`expo-speech-recognition`](https://www.npmjs.com/package/expo-speech-recognition) (listed in `package.json`).
- Requires a **development build** (not Expo Go); native code is included via the Expo config plugin.

### 2. Permissions and config plugin

**iOS** (`app.json` / plugin):

- `NSMicrophoneUsageDescription` — microphone access.
- `NSSpeechRecognitionUsageDescription` — speech recognition.

**Android** (`app.json`):

- `RECORD_AUDIO` (plugin also adds manifest entries needed for speech services).

**Plugin** (`app.json` → `plugins`):

- `expo-speech-recognition` with `microphonePermission` and `speechRecognitionPermission` strings for the Big Buys app.

After changing the plugin, rebuild native projects (`npx expo prebuild` and/or EAS build).

### 3. Custom hook

**File**: `hooks/useVoiceRecording.tsx`

Features:

- `ExpoSpeechRecognitionModule.start` / `stop` / `abort`
- `useSpeechRecognitionEvent` for `start`, `end`, `result`, and `error`
- Interim results via `interimResults: true`, continuous via `continuous: true`
- Permission request via `requestPermissionsAsync`
- Availability check via `isRecognitionAvailable`
- 30-second silence auto-stop (resets on any partial/final result; calls `stop()` only after 30s with no transcript activity). There is no total-duration cap.
- Accumulates final segments internally (continuous mode on Android emits multiple `isFinal` segments per session) and passes the full running transcript to `onResult`.
- Alerts for permission / network style errors; ignores `aborted` on cancel

**API** (unchanged for callers):

```typescript
const {
  isRecording,
  partialResults,
  transcript,
  error,
  startRecording,
  stopRecording,
  cancelRecording,
} = useVoiceRecording({
  onResult: (text) => setInputValue(text),
  onError: (error) => console.error(error),
});
```

`transcript` is the running accumulated final transcript (new in this version). `onResult` is still called on every final segment with the full accumulated text.

### 4. ChatModal component

**File**: `components/ChatModal.tsx`

- Microphone control, recording indicator, partial results, and integration with `useVoiceRecording` as documented previously (UI section still applies).

### 5. Styles

Voice-related styles in `ChatModal.tsx` (mic button, recording indicator, etc.) — unchanged in purpose.

### 6. Edge cases

- Permission denied — alert and messaging aligned with expo-speech-recognition error codes (e.g. `not-allowed`, `network`).
- Long sessions — no hard cap; 30s-of-silence watchdog ends the session gracefully.
- Cancel — `abort()`; `aborted` errors are not surfaced to the user.

## Testing instructions

### ⚠️ Not available in Expo Go

Use a **custom development build** (e.g. `expo-dev-client` + `npx expo run:ios` / `run:android` or EAS).

**Prebuild** (when regenerating native folders):

```bash
cd /path/to/mobile
npx expo prebuild --clean
```

**Run on device**:

```bash
npx expo run:ios
# or
npx expo run:android
```

### Test scenarios

Same flows as before: mic start/stop, partial text, final text into the input, permissions, and error cases (e.g. airplane mode, long silence, rapid start/stop).

## Files involved

| Purpose | Path |
|--------|------|
| Hook | `hooks/useVoiceRecording.tsx` |
| UI | `components/ChatModal.tsx` |
| Expo config | `app.json` (plugins + permissions) |
| Dependency | `package.json` (`expo-speech-recognition`) |
| This doc | `plans/VOICE_TO_TEXT_IMPLEMENTATION.md` |

## Architecture

```
ChatModal
├── useVoiceRecording
│   ├── expo-speech-recognition (ExpoSpeechRecognitionModule + useSpeechRecognitionEvent)
│   └── State: isRecording, partialResults, error
└── Voice UI (mic, indicator, animations)
```

## Technical details

- **iOS**: Speech framework (`SFSpeechRecognizer`) via the module.
- **Android**: `SpeechRecognizer` and configured recognition service visibility (plugin).
- **Default language**: `en-US` (configurable via hook prop).
- **Timeout**: 30 seconds of silence (no partial/final results), then `stop()`. Resets on any transcript activity. No overall-duration cap.

## Optional enhancements

Same ideas as before: language selection, auto-send, haptics, on-device recognition, etc., using options exposed by `expo-speech-recognition` (e.g. `continuous`, `requiresOnDeviceRecognition`).

## Status

**Ready for testing** on physical devices with a dev build after native rebuild.

**Last updated**: April 2026
