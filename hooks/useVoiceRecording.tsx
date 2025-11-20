import { useState, useEffect, useCallback, useRef } from 'react';
import { Alert, Platform } from 'react-native';

// Dynamically import Voice to prevent errors in Expo Go
let Voice: any = null;
try {
  Voice = require('@react-native-voice/voice').default;
} catch (error) {
  console.warn('Voice module not available - requires custom dev build');
}

interface SpeechResultsEvent {
  value?: string[];
}

interface SpeechErrorEvent {
  error?: {
    message?: string;
    code?: string;
  };
}

interface SpeechStartEvent {}
interface SpeechEndEvent {}

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

/**
 * Custom hook for managing voice recording and speech-to-text conversion
 * Uses @react-native-voice/voice library for native speech recognition
 */
export const useVoiceRecording = ({
  onResult,
  onError,
  language = 'en-US',
}: UseVoiceRecordingProps): UseVoiceRecordingReturn => {
  const [isRecording, setIsRecording] = useState(false);
  const [partialResults, setPartialResults] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Handle speech results (final transcription)
   */
  const onSpeechResults = useCallback((event: SpeechResultsEvent) => {
    console.log('🎤 Speech results:', event.value);
    if (event.value && event.value.length > 0) {
      const transcribedText = event.value[0];
      onResult(transcribedText);
      setPartialResults([]);
    }
  }, [onResult]);

  /**
   * Handle partial speech results (real-time transcription)
   */
  const onSpeechPartialResults = useCallback((event: SpeechResultsEvent) => {
    console.log('🎤 Partial results:', event.value);
    if (event.value) {
      setPartialResults(event.value);
    }
  }, []);

  /**
   * Handle speech recognition errors
   */
  const onSpeechError = useCallback((event: SpeechErrorEvent) => {
    console.error('🎤 Speech error:', event.error);
    setError(event.error?.message || 'Speech recognition error');
    setIsRecording(false);
    
    if (onError) {
      onError(event.error?.message || 'Speech recognition error');
    }

    // Show user-friendly error messages
    if (event.error?.code === 'permissions') {
      Alert.alert(
        'Microphone Permission Required',
        'Please enable microphone access in your device settings to use voice-to-text.',
        [{ text: 'OK' }]
      );
    } else if (event.error?.code === 'network') {
      Alert.alert(
        'Network Error',
        'Speech recognition requires an internet connection. Please check your connection and try again.',
        [{ text: 'OK' }]
      );
    }
  }, [onError]);

  /**
   * Handle when speech recognition starts
   */
  const onSpeechStart = useCallback((event: SpeechStartEvent) => {
    console.log('🎤 Speech started');
    setIsRecording(true);
    setError(null);
    setPartialResults([]);

    // Set a timeout to auto-stop recording after 60 seconds
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      console.log('🎤 Auto-stopping recording after 60 seconds');
      stopRecording();
    }, 60000);
  }, []);

  /**
   * Handle when speech recognition ends
   */
  const onSpeechEnd = useCallback((event: SpeechEndEvent) => {
    console.log('🎤 Speech ended');
    setIsRecording(false);
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  /**
   * Initialize Voice event listeners
   */
  useEffect(() => {
    // Skip initialization if Voice module is not available
    if (!Voice) {
      console.warn('Voice module not available - skipping initialization');
      return;
    }

    Voice.onSpeechStart = onSpeechStart;
    Voice.onSpeechEnd = onSpeechEnd;
    Voice.onSpeechResults = onSpeechResults;
    Voice.onSpeechPartialResults = onSpeechPartialResults;
    Voice.onSpeechError = onSpeechError;

    return () => {
      // Cleanup
      if (Voice) {
        Voice.destroy().then(Voice.removeAllListeners);
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [onSpeechStart, onSpeechEnd, onSpeechResults, onSpeechPartialResults, onSpeechError]);

  /**
   * Start speech recognition
   */
  const startRecording = useCallback(async () => {
    try {
      // Check if Voice module is available
      if (!Voice) {
        Alert.alert(
          'Voice Feature Not Available',
          'Voice-to-text requires a custom development build. Please run "npx expo prebuild" and rebuild the app to use this feature.',
          [{ text: 'OK' }]
        );
        return;
      }

      setError(null);
      setPartialResults([]);
      
      // Check if already recording
      const isAvailable = await Voice.isAvailable();
      if (!isAvailable) {
        throw new Error('Speech recognition is not available on this device');
      }

      // Start recording
      await Voice.start(language);
      console.log('🎤 Started recording');
    } catch (err) {
      console.error('🎤 Error starting recording:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to start recording';
      setError(errorMessage);
      setIsRecording(false);
      
      if (onError) {
        onError(errorMessage);
      }

      Alert.alert(
        'Recording Failed',
        'Could not start voice recording. Please try again.',
        [{ text: 'OK' }]
      );
    }
  }, [language, onError]);

  /**
   * Stop speech recognition and process final results
   */
  const stopRecording = useCallback(async () => {
    try {
      if (!Voice) return;
      
      await Voice.stop();
      console.log('🎤 Stopped recording');
      setIsRecording(false);
      
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    } catch (err) {
      console.error('🎤 Error stopping recording:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to stop recording';
      setError(errorMessage);
      setIsRecording(false);
      
      if (onError) {
        onError(errorMessage);
      }
    }
  }, [onError]);

  /**
   * Cancel recording without using the results
   */
  const cancelRecording = useCallback(async () => {
    try {
      if (!Voice) return;
      
      await Voice.cancel();
      console.log('🎤 Cancelled recording');
      setIsRecording(false);
      setPartialResults([]);
      setError(null);
      
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    } catch (err) {
      console.error('🎤 Error cancelling recording:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to cancel recording';
      setError(errorMessage);
      setIsRecording(false);
      
      if (onError) {
        onError(errorMessage);
      }
    }
  }, [onError]);

  return {
    isRecording,
    partialResults,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
  };
};

