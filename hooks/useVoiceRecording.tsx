import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import type {
  ExpoSpeechRecognitionErrorEvent,
  ExpoSpeechRecognitionResultEvent,
} from 'expo-speech-recognition';

interface UseVoiceRecordingProps {
  onResult: (text: string) => void;
  onError?: (error: string) => void;
  language?: string;
}

interface UseVoiceRecordingReturn {
  isRecording: boolean;
  partialResults: string[];
  transcript: string;
  error: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  cancelRecording: () => Promise<void>;
}

/**
 * Auto-stop recognition only after this long of no transcript activity.
 * Continuous mode otherwise runs until `stopRecording` / `cancelRecording`.
 */
const SILENCE_TIMEOUT_MS = 30_000;

/**
 * After the iOS permission alert dismisses, AVAudioSession is briefly
 * deactivated by the system. Calling `start()` immediately can race that
 * deactivation and cause the recognizer to emit `error` + `end` right after
 * `start`. Waiting a beat lets the audio session settle.
 */
const POST_PERMISSION_GRANT_DELAY_MS = 400;

/**
 * Errors that indicate a transient startup glitch (typically the AVAudioSession
 * isn't fully ready yet). We retry `start()` once on these instead of surfacing
 * them to the user.
 */
const TRANSIENT_START_ERRORS = new Set<string>([
  'audio-capture',
  'interrupted',
  'busy',
  'client',
]);

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Voice-to-text via expo-speech-recognition (native iOS/Android + web API on web).
 * Requires a dev build; not available in Expo Go.
 *
 * Uses continuous recognition. There is no total-duration cap; the session only
 * auto-stops after {@link SILENCE_TIMEOUT_MS} of no transcript activity, or when
 * `stopRecording` / `cancelRecording` is called.
 *
 * Final-result segments (emitted periodically in continuous mode, especially on
 * Android) are accumulated internally, and `onResult` always receives the full
 * accumulated transcript rather than just the latest segment.
 */
export const useVoiceRecording = ({
  onResult,
  onError,
  language = 'en-US',
}: UseVoiceRecordingProps): UseVoiceRecordingReturn => {
  const [isRecording, setIsRecording] = useState(false);
  const [partialResults, setPartialResults] = useState<string[]>([]);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accumulatedRef = useRef('');
  /** Most recent options passed to `start()`, so we can retry on transient errors. */
  const lastStartOptionsRef = useRef<Parameters<typeof ExpoSpeechRecognitionModule.start>[0] | null>(null);
  /** True between calling `start()` and receiving the first `start` event. */
  const startingRef = useRef(false);
  /** True when we're allowed to retry once on a transient startup error. */
  const retryAvailableRef = useRef(false);

  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onResultRef.current = onResult;
    onErrorRef.current = onError;
  }, [onResult, onError]);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const resetSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
    }
    silenceTimerRef.current = setTimeout(() => {
      silenceTimerRef.current = null;
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch {
        // Ignore - recognizer may already have ended
      }
    }, SILENCE_TIMEOUT_MS);
  }, []);

  const handleError = useCallback((event: ExpoSpeechRecognitionErrorEvent) => {
    if (event.error === 'aborted') {
      return;
    }

    // Transient startup glitch (e.g. AVAudioSession not yet ready after the
    // permission alert dismissed). Try one silent retry before surfacing
    // anything to the user.
    if (
      retryAvailableRef.current &&
      TRANSIENT_START_ERRORS.has(event.error) &&
      lastStartOptionsRef.current
    ) {
      retryAvailableRef.current = false;
      const opts = lastStartOptionsRef.current;
      // The native side will emit `end` after this error; once that fires the
      // recognizer is back to idle and we can `start()` again. Defer slightly
      // to let that settle.
      setTimeout(() => {
        try {
          startingRef.current = true;
          ExpoSpeechRecognitionModule.start(opts);
        } catch {
          startingRef.current = false;
        }
      }, 250);
      return;
    }

    setError(event.message);
    setIsRecording(false);
    startingRef.current = false;
    onErrorRef.current?.(event.message);

    if (event.error === 'not-allowed') {
      Alert.alert(
        'Microphone Permission Required',
        'Please enable microphone access in your device settings to use voice-to-text.',
        [{ text: 'OK' }]
      );
    } else if (event.error === 'network') {
      Alert.alert(
        'Network Error',
        'Speech recognition requires an internet connection. Please check your connection and try again.',
        [{ text: 'OK' }]
      );
    }
  }, []);

  const handleResult = useCallback(
    (event: ExpoSpeechRecognitionResultEvent) => {
      const first = event.results[0];
      const text = first?.transcript?.trim() ?? '';
      if (!text) {
        return;
      }

      resetSilenceTimer();

      if (event.isFinal) {
        // Append this final segment to the running transcript so we don't lose
        // prior utterances when the recognizer emits multiple finals
        // (e.g. Android's segmented continuous session).
        accumulatedRef.current = accumulatedRef.current
          ? `${accumulatedRef.current} ${text}`
          : text;
        setTranscript(accumulatedRef.current);
        setPartialResults([]);
        onResultRef.current(accumulatedRef.current);
      } else {
        setPartialResults([text]);
      }
    },
    [resetSilenceTimer]
  );

  useSpeechRecognitionEvent('start', () => {
    startingRef.current = false;
    setIsRecording(true);
    setError(null);
    setPartialResults([]);
    accumulatedRef.current = '';
    setTranscript('');
    resetSilenceTimer();
  });

  useSpeechRecognitionEvent('end', () => {
    // If we're mid-retry (a transient error already scheduled another start()),
    // don't flip isRecording to false here — that would briefly close the
    // recording UI between retries.
    if (startingRef.current) {
      return;
    }
    setIsRecording(false);
    clearSilenceTimer();
  });

  useSpeechRecognitionEvent('result', handleResult);
  useSpeechRecognitionEvent('error', handleError);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      setPartialResults([]);
      accumulatedRef.current = '';
      setTranscript('');

      // Check current permission status first so we only show the system
      // permission alert when we actually need to. When we *do* show it, the
      // iOS audio session is briefly deactivated as the alert dismisses; we
      // need to wait for it to settle before calling `start()` or the
      // recognizer will fail with `audio-capture` / `interrupted`.
      let granted = false;
      let prompted = false;
      try {
        const current = await ExpoSpeechRecognitionModule.getPermissionsAsync();
        granted = current.granted;
      } catch {
        // Some platforms / older module versions may not implement getPermissionsAsync;
        // fall through to requesting.
      }
      if (!granted) {
        const requested = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        granted = requested.granted;
        prompted = true;
      }

      if (!granted) {
        Alert.alert(
          'Microphone Permission Required',
          'Voice-to-text needs microphone and speech recognition access.',
          [{ text: 'OK' }]
        );
        return;
      }

      if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
        throw new Error('Speech recognition is not available on this device');
      }

      // After a fresh grant on iOS the AVAudioSession is briefly torn down by
      // the system permission dialog; wait for it to come back before start().
      if (prompted && Platform.OS === 'ios') {
        await sleep(POST_PERMISSION_GRANT_DELAY_MS);
      }

      const options = {
        lang: language,
        interimResults: true,
        continuous: true,
        addsPunctuation: true,
      } as const;
      lastStartOptionsRef.current = options;
      retryAvailableRef.current = true;
      startingRef.current = true;
      ExpoSpeechRecognitionModule.start(options);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to start recording';
      setError(errorMessage);
      setIsRecording(false);
      startingRef.current = false;
      onErrorRef.current?.(errorMessage);
      Alert.alert(
        'Recording Failed',
        'Could not start voice recording. Please try again.',
        [{ text: 'OK' }]
      );
    }
  }, [language]);

  const stopRecording = useCallback(async () => {
    try {
      clearSilenceTimer();
      retryAvailableRef.current = false;
      startingRef.current = false;
      ExpoSpeechRecognitionModule.stop();
      setIsRecording(false);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to stop recording';
      setError(errorMessage);
      setIsRecording(false);
      onErrorRef.current?.(errorMessage);
    }
  }, [clearSilenceTimer]);

  const cancelRecording = useCallback(async () => {
    try {
      clearSilenceTimer();
      retryAvailableRef.current = false;
      startingRef.current = false;
      ExpoSpeechRecognitionModule.abort();
      setIsRecording(false);
      setPartialResults([]);
      accumulatedRef.current = '';
      setTranscript('');
      setError(null);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to cancel recording';
      setError(errorMessage);
      setIsRecording(false);
      onErrorRef.current?.(errorMessage);
    }
  }, [clearSilenceTimer]);

  useEffect(() => {
    return () => {
      clearSilenceTimer();
    };
  }, [clearSilenceTimer]);

  return {
    isRecording,
    partialResults,
    transcript,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
  };
};
