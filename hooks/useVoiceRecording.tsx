import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
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
  error: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  cancelRecording: () => Promise<void>;
}

/** Auto-stop recognition after this long (continuous mode otherwise runs until manual stop). */
const MAX_RECORDING_DURATION_MS = 60_000;

/**
 * Voice-to-text via expo-speech-recognition (native iOS/Android + web API on web).
 * Requires a dev build; not available in Expo Go.
 *
 * Uses continuous recognition (no silence cutoff). Sessions auto-stop after
 * {@link MAX_RECORDING_DURATION_MS} or when `stopRecording` / `cancelRecording` runs.
 */
export const useVoiceRecording = ({
  onResult,
  onError,
  language = 'en-US',
}: UseVoiceRecordingProps): UseVoiceRecordingReturn => {
  const [isRecording, setIsRecording] = useState(false);
  const [partialResults, setPartialResults] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const maxDurationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onResultRef.current = onResult;
    onErrorRef.current = onError;
  }, [onResult, onError]);

  const clearMaxDurationTimeout = useCallback(() => {
    if (maxDurationTimeoutRef.current) {
      clearTimeout(maxDurationTimeoutRef.current);
      maxDurationTimeoutRef.current = null;
    }
  }, []);

  const handleError = useCallback((event: ExpoSpeechRecognitionErrorEvent) => {
    if (event.error === 'aborted') {
      return;
    }
    setError(event.message);
    setIsRecording(false);
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

  const handleResult = useCallback((event: ExpoSpeechRecognitionResultEvent) => {
    const first = event.results[0];
    if (!first?.transcript) {
      return;
    }
    if (event.isFinal) {
      onResultRef.current(first.transcript);
      setPartialResults([]);
    } else {
      setPartialResults([first.transcript]);
    }
  }, []);

  useSpeechRecognitionEvent('start', () => {
    setIsRecording(true);
    setError(null);
    setPartialResults([]);
    clearMaxDurationTimeout();
    maxDurationTimeoutRef.current = setTimeout(() => {
      ExpoSpeechRecognitionModule.stop();
    }, MAX_RECORDING_DURATION_MS);
  });

  useSpeechRecognitionEvent('end', () => {
    setIsRecording(false);
    clearMaxDurationTimeout();
  });

  useSpeechRecognitionEvent('result', handleResult);
  useSpeechRecognitionEvent('error', handleError);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      setPartialResults([]);

      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) {
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

      ExpoSpeechRecognitionModule.start({
        lang: language,
        interimResults: true,
        continuous: true,
      });
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to start recording';
      setError(errorMessage);
      setIsRecording(false);
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
      clearMaxDurationTimeout();
      ExpoSpeechRecognitionModule.stop();
      setIsRecording(false);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to stop recording';
      setError(errorMessage);
      setIsRecording(false);
      onErrorRef.current?.(errorMessage);
    }
  }, [clearMaxDurationTimeout]);

  const cancelRecording = useCallback(async () => {
    try {
      clearMaxDurationTimeout();
      ExpoSpeechRecognitionModule.abort();
      setIsRecording(false);
      setPartialResults([]);
      setError(null);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to cancel recording';
      setError(errorMessage);
      setIsRecording(false);
      onErrorRef.current?.(errorMessage);
    }
  }, [clearMaxDurationTimeout]);

  useEffect(() => {
    return () => {
      clearMaxDurationTimeout();
    };
  }, [clearMaxDurationTimeout]);

  return {
    isRecording,
    partialResults,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
  };
};
