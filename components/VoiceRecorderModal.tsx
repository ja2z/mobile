import React, { useCallback, useEffect, useRef } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { borderRadius, colors, shadows, spacing, typography } from '../constants/Theme';
import { useVoiceRecording } from '../hooks/useVoiceRecording';

type VoiceRecorderModalProps = {
  visible: boolean;
  onClose: () => void;
  /** Called once with the transcript (may be empty if nothing was recognized). */
  onComplete: (text: string) => void;
};

/**
 * Compact inline overlay for voice input via expo-speech-recognition.
 * Renders as an absolutely-positioned card on top of the parent container
 * (no Modal). Returns null when not visible.
 */
export function VoiceRecorderModal({
  visible,
  onClose,
  onComplete,
}: VoiceRecorderModalProps) {
  const completedRef = useRef(false);
  const lastTextRef = useRef('');
  const doneFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasVisibleRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const finishIfNeeded = useCallback((text: string) => {
    if (completedRef.current) return;
    completedRef.current = true;
    if (doneFallbackTimerRef.current) {
      clearTimeout(doneFallbackTimerRef.current);
      doneFallbackTimerRef.current = null;
    }
    onCompleteRef.current(text.trim());
  }, []);

  const handleResult = useCallback(
    (text: string) => {
      finishIfNeeded(text);
    },
    [finishIfNeeded]
  );

  const {
    isRecording,
    partialResults,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
  } = useVoiceRecording({
    onResult: handleResult,
  });

  useEffect(() => {
    const p = partialResults[0];
    if (p) {
      lastTextRef.current = p;
    }
  }, [partialResults]);

  useEffect(() => {
    if (visible) {
      if (!wasVisibleRef.current) {
        if (doneFallbackTimerRef.current) {
          clearTimeout(doneFallbackTimerRef.current);
          doneFallbackTimerRef.current = null;
        }
        completedRef.current = false;
        lastTextRef.current = '';
        void startRecording();
      }
      wasVisibleRef.current = true;
      return;
    }
    wasVisibleRef.current = false;
    if (doneFallbackTimerRef.current) {
      clearTimeout(doneFallbackTimerRef.current);
      doneFallbackTimerRef.current = null;
    }
    if (!completedRef.current) {
      void cancelRecording();
    }
  }, [visible, startRecording, cancelRecording]);

  const handleCancel = useCallback(() => {
    if (!completedRef.current) {
      void cancelRecording();
    }
    onClose();
  }, [cancelRecording, onClose]);

  const handleDone = useCallback(() => {
    void stopRecording();
    if (doneFallbackTimerRef.current) {
      clearTimeout(doneFallbackTimerRef.current);
    }
    doneFallbackTimerRef.current = setTimeout(() => {
      doneFallbackTimerRef.current = null;
      finishIfNeeded(lastTextRef.current);
    }, 500);
  }, [stopRecording, finishIfNeeded]);

  useEffect(() => {
    return () => {
      if (doneFallbackTimerRef.current) {
        clearTimeout(doneFallbackTimerRef.current);
      }
    };
  }, []);

  if (!visible) return null;

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <View style={styles.card}>
        <View style={styles.body}>
          {!isRecording && !error && (
            <ActivityIndicator size="large" color={colors.primary} />
          )}
          {error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : (
            <Text style={styles.transcript} numberOfLines={10}>
              {partialResults.length > 0
                ? partialResults[0]
                : isRecording
                  ? 'Listening…'
                  : ''}
            </Text>
          )}
        </View>

        <View style={styles.footer}>
          <Pressable
            style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
            onPress={handleCancel}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.doneButton, pressed && styles.pressed]}
            onPress={handleDone}
            disabled={!isRecording}
          >
            <Text style={styles.doneButtonText}>Done</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  card: {
    width: '85%',
    maxHeight: '60%',
    minHeight: 180,
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    ...shadows.medium,
    ...(Platform.OS === 'android' ? { elevation: 8 } : {}),
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 80,
  },
  transcript: {
    ...typography.body,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  errorText: {
    ...typography.body,
    color: colors.error,
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  doneButton: {
    flex: 1,
    height: 48,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneButtonText: {
    ...typography.body,
    color: '#fff',
    fontWeight: '600',
  },
  cancelButton: {
    flex: 1,
    height: 48,
    borderRadius: borderRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cancelButtonText: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.85,
  },
});
