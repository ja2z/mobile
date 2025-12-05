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
  
  // Use refs to keep callbacks stable across renders
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  
  // Update refs when callbacks change
  useEffect(() => {
    onResultRef.current = onResult;
    onErrorRef.current = onError;
  }, [onResult, onError]);

  /**
   * Handle speech results (final transcription)
   */
  const onSpeechResults = useCallback((event: SpeechResultsEvent) => {
    console.log('🎤 ===== SPEECH RESULTS CALLBACK =====');
    console.log('🎤 Event:', JSON.stringify(event, null, 2));
    console.log('🎤 Results array:', event.value);
    if (event.value && event.value.length > 0) {
      const transcribedText = event.value[0];
      console.log('🎤 Transcribed text:', transcribedText);
      console.log('🎤 Calling onResult callback...');
      onResultRef.current(transcribedText);
      setPartialResults([]);
      console.log('🎤 onResult callback completed');
    } else {
      console.log('🎤 No results in event.value');
    }
    console.log('🎤 ===== END SPEECH RESULTS =====');
  }, []); // No dependencies - use ref instead

  /**
   * Handle partial speech results (real-time transcription)
   */
  const onSpeechPartialResults = useCallback((event: SpeechResultsEvent) => {
    console.log('🎤 ===== PARTIAL RESULTS CALLBACK =====');
    console.log('🎤 Partial event:', JSON.stringify(event, null, 2));
    console.log('🎤 Partial results:', event.value);
    if (event.value) {
      setPartialResults(event.value);
    }
    console.log('🎤 ===== END PARTIAL RESULTS =====');
  }, []);

  /**
   * Handle speech recognition errors
   */
  const onSpeechError = useCallback((event: SpeechErrorEvent) => {
    console.log('🎤 ===== SPEECH ERROR CALLBACK =====');
    console.error('🎤 Error event:', JSON.stringify(event, null, 2));
    console.error('🎤 Error code:', event.error?.code);
    console.error('🎤 Error message:', event.error?.message);
    setError(event.error?.message || 'Speech recognition error');
    setIsRecording(false);
    
    if (onErrorRef.current) {
      onErrorRef.current(event.error?.message || 'Speech recognition error');
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
    console.log('🎤 ===== END SPEECH ERROR =====');
  }, []); // No dependencies - use ref instead

  /**
   * Handle when speech recognition starts
   */
  const onSpeechStart = useCallback((event: SpeechStartEvent) => {
    console.log('🎤 ===== SPEECH START CALLBACK =====');
    console.log('🎤 Start event:', JSON.stringify(event, null, 2));
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
    console.log('🎤 ===== END SPEECH START =====');
  }, []);

  /**
   * Handle when speech recognition ends
   */
  const onSpeechEnd = useCallback((event: SpeechEndEvent) => {
    console.log('🎤 ===== SPEECH END CALLBACK =====');
    console.log('🎤 End event:', JSON.stringify(event, null, 2));
    console.log('🎤 Speech ended');
    setIsRecording(false);
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    console.log('🎤 ===== END SPEECH END =====');
  }, []);

  /**
   * Initialize Voice event listeners
   * Only runs once on mount to avoid removing listeners during recording
   */
  useEffect(() => {
    // Skip initialization if Voice module is not available
    if (!Voice) {
      console.warn('🎤 Voice module not available - skipping initialization');
      return;
    }

    console.log('🎤 ===== INITIALIZING VOICE EVENT LISTENERS (ONCE) =====');
    console.log('🎤 Registering onSpeechStart...');
    Voice.onSpeechStart = onSpeechStart;
    console.log('🎤 Registering onSpeechEnd...');
    Voice.onSpeechEnd = onSpeechEnd;
    console.log('🎤 Registering onSpeechResults...');
    Voice.onSpeechResults = onSpeechResults;
    console.log('🎤 Registering onSpeechPartialResults...');
    Voice.onSpeechPartialResults = onSpeechPartialResults;
    console.log('🎤 Registering onSpeechError...');
    Voice.onSpeechError = onSpeechError;
    console.log('🎤 All event listeners registered successfully');
    console.log('🎤 ===== END INITIALIZATION =====');

    return () => {
      // Cleanup only on unmount
      console.log('🎤 Component unmounting - cleaning up Voice listeners...');
      if (Voice) {
        Voice.destroy().then(Voice.removeAllListeners).catch(err => {
          console.error('🎤 Error during Voice cleanup:', err);
        });
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []); // Empty dependency array - only run once on mount

  /**
   * Start speech recognition
   */
  const startRecording = useCallback(async () => {
    try {
      console.log('🎤 ===== START RECORDING CALLED =====');
      
      // Check if Voice module is available
      if (!Voice) {
        console.log('🎤 Voice module is null');
        Alert.alert(
          'Voice Feature Not Available',
          'Voice-to-text requires a custom development build. Please run "npx expo prebuild" and rebuild the app to use this feature.',
          [{ text: 'OK' }]
        );
        return;
      }

      console.log('🎤 Voice module exists');
      setError(null);
      setPartialResults([]);
      
      // Check if speech recognition is available
      console.log('🎤 Checking if speech recognition is available...');
      const isAvailable = await Voice.isAvailable();
      console.log('🎤 Speech recognition available:', isAvailable);
      
      if (!isAvailable) {
        throw new Error('Speech recognition is not available on this device');
      }

      // Start recording
      console.log('🎤 Calling Voice.start with language:', language);
      await Voice.start(language);
      console.log('🎤 Started recording');
      console.log('🎤 ===== END START RECORDING =====');
    } catch (err) {
      console.error('🎤 ===== ERROR STARTING RECORDING =====');
      console.error('🎤 Error:', err);
      console.error('🎤 Error type:', typeof err);
      console.error('🎤 Error message:', err instanceof Error ? err.message : String(err));
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
      console.log('🎤 ===== END ERROR =====');
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

