import React, { useCallback, useEffect, useRef } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
} from 'react-native';
import { colors, spacing, typography } from '../constants/Theme';
import { useVoiceRecording } from '../hooks/useVoiceRecording';

type VoiceRecorderModalProps = {
  visible: boolean;
  onClose: () => void;
  /** Called once with the transcript (may be empty if nothing was recognized). */
  onComplete: (text: string) => void;
};

/**
 * Full-screen modal for voice input via expo-speech-recognition.
 * Shown when the embed requests `invokeRecorder` (same pattern as `invokeQRscanner`).
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
    // If the engine does not emit a final result, commit last partial / empty after a short delay.
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

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleCancel}
    >
      <View style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.title}>Voice input</Text>
          <Text style={styles.hint}>
            Speak clearly. Tap Done when finished, or Cancel to discard.
          </Text>
        </View>

        <View style={styles.body}>
          {!isRecording && !error && visible && (
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
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
            onPress={handleCancel}
          >
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            onPress={handleDone}
            disabled={!isRecording}
          >
            <Text style={styles.primaryButtonText}>Done</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: spacing.xl,
  },
  header: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  hint: {
    ...typography.body,
    color: colors.textSecondary,
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryButtonText: {
    ...typography.body,
    color: '#fff',
    fontWeight: '600',
  },
  secondaryButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryButtonText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  pressed: {
    opacity: 0.85,
  },
});
