import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { borderRadius, colors, shadows, spacing, typography } from '../constants/Theme';
import { useActiveMicLabel } from '../hooks/useActiveMicLabel';
import { useVoiceRecording } from '../hooks/useVoiceRecording';

type VoiceRecorderModalProps = {
  visible: boolean;
  onClose: () => void;
  /** Called once with the transcript (may be empty if nothing was recognized). */
  onComplete: (text: string) => void;
};

const formatDuration = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

/**
 * Compact inline overlay for voice input via expo-speech-recognition.
 * Renders as an absolutely-positioned card on top of the parent container
 * (no Modal). Returns null when not visible.
 *
 * Completion is driven by the recognizer's `end` event (exposed as
 * `isRecording` going from true -> false in the hook), not by individual
 * final result segments. This allows continuous dictation that only stops
 * on 30s of silence, manual Done, or Cancel.
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
  const wasRecordingRef = useRef(false);
  /** Timestamp of the most recent isRecording false→true transition. Used to
   * suppress completion on a same-frame true→false blip caused by a startup
   * race (e.g. AVAudioSession not ready right after the iOS permission alert). */
  const recordingStartedAtRef = useRef<number | null>(null);
  /** When true, the user pressed Done — any subsequent end-of-session should
   * complete regardless of how short the recording was. */
  const stopRequestedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const [elapsedMs, setElapsedMs] = useState(0);
  const startedAtRef = useRef<number | null>(null);
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const scrollViewRef = useRef<ScrollView | null>(null);

  const clearTickInterval = useCallback(() => {
    if (tickIntervalRef.current) {
      clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
    }
  }, []);

  const finishIfNeeded = useCallback((text: string) => {
    if (completedRef.current) return;
    completedRef.current = true;
    if (doneFallbackTimerRef.current) {
      clearTimeout(doneFallbackTimerRef.current);
      doneFallbackTimerRef.current = null;
    }
    onCompleteRef.current(text.trim());
  }, []);

  const activeMicLabel = useActiveMicLabel();

  const {
    isRecording,
    partialResults,
    transcript,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
  } = useVoiceRecording({
    // Keep the latest accumulated transcript around, but do NOT finish the
    // modal here. Final results in continuous mode arrive repeatedly
    // (especially on Android) and we only want to complete on session end.
    onResult: (text) => {
      lastTextRef.current = text;
    },
  });

  useEffect(() => {
    // Mirror both the accumulated final transcript and the current partial
    // into lastTextRef so we always have the most recent text available
    // when the session ends.
    const partial = partialResults[0]?.trim() ?? '';
    const base = transcript.trim();
    if (partial) {
      lastTextRef.current = base ? `${base} ${partial}` : partial;
    } else if (base) {
      lastTextRef.current = base;
    }
  }, [partialResults, transcript]);

  useEffect(() => {
    if (visible) {
      if (!wasVisibleRef.current) {
        if (doneFallbackTimerRef.current) {
          clearTimeout(doneFallbackTimerRef.current);
          doneFallbackTimerRef.current = null;
        }
        completedRef.current = false;
        lastTextRef.current = '';
        wasRecordingRef.current = false;
        recordingStartedAtRef.current = null;
        stopRequestedRef.current = false;
        setElapsedMs(0);
        startedAtRef.current = null;
        clearTickInterval();
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
    clearTickInterval();
    startedAtRef.current = null;
    if (!completedRef.current) {
      void cancelRecording();
    }
  }, [visible, startRecording, cancelRecording, clearTickInterval]);

  useEffect(() => {
    // Detect the recognizer ending: isRecording transitioning from true -> false
    // while the modal is still visible. This is the single completion path,
    // covering 30s silence auto-stop, user Done, and platform errors.
    if (wasRecordingRef.current && !isRecording && visible && !completedRef.current) {
      const startedAt = recordingStartedAtRef.current;
      const elapsedSinceStart = startedAt !== null ? Date.now() - startedAt : Infinity;
      const hasAnyText = !!lastTextRef.current.trim();
      // Suppress completion on a sub-second true→false blip with no text and
      // no explicit stop. That's a startup race (typically iOS AVAudioSession
      // not yet ready right after the permission alert dismissed); the hook
      // will retry start() and `isRecording` will flip back to true shortly.
      const isStartupGlitch =
        !stopRequestedRef.current && !hasAnyText && elapsedSinceStart < 1000;
      if (!isStartupGlitch) {
        finishIfNeeded(lastTextRef.current);
      }
    }
    if (isRecording && !wasRecordingRef.current) {
      recordingStartedAtRef.current = Date.now();
    }
    wasRecordingRef.current = isRecording;
  }, [isRecording, visible, finishIfNeeded]);

  useEffect(() => {
    // Drive the elapsed-time indicator: start the tick when recording begins,
    // freeze it when the recognizer ends (Done / silence / error).
    if (isRecording) {
      if (startedAtRef.current === null) {
        startedAtRef.current = Date.now();
        setElapsedMs(0);
      }
      if (!tickIntervalRef.current) {
        tickIntervalRef.current = setInterval(() => {
          if (startedAtRef.current !== null) {
            setElapsedMs(Date.now() - startedAtRef.current);
          }
        }, 1000);
      }
    } else {
      clearTickInterval();
    }
  }, [isRecording, clearTickInterval]);

  const handleCancel = useCallback(() => {
    if (!completedRef.current) {
      void cancelRecording();
    }
    onClose();
  }, [cancelRecording, onClose]);

  const handleDone = useCallback(() => {
    stopRequestedRef.current = true;
    void stopRecording();
    // Safety net in case the `end` event never fires (e.g. native edge case);
    // normally the isRecording->false effect above completes first.
    if (doneFallbackTimerRef.current) {
      clearTimeout(doneFallbackTimerRef.current);
    }
    doneFallbackTimerRef.current = setTimeout(() => {
      doneFallbackTimerRef.current = null;
      finishIfNeeded(lastTextRef.current);
    }, 2000);
  }, [stopRecording, finishIfNeeded]);

  useEffect(() => {
    return () => {
      if (doneFallbackTimerRef.current) {
        clearTimeout(doneFallbackTimerRef.current);
      }
      clearTickInterval();
    };
  }, [clearTickInterval]);

  const displayText =
    partialResults[0]?.trim() || transcript.trim() || (isRecording ? 'Listening…' : '');

  useEffect(() => {
    // Keep the most recently said text pinned to the bottom of the scroll view.
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollToEnd({ animated: true });
    }
  }, [displayText]);

  if (!visible) return null;

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <View style={styles.card}>
        <Text style={styles.durationText}>{formatDuration(elapsedMs)}</Text>
        {isRecording && activeMicLabel ? (
          <Text style={styles.micLabel} numberOfLines={1}>
            Recording from {activeMicLabel}
          </Text>
        ) : null}

        <View style={styles.body}>
          {!isRecording && !error && (
            <ActivityIndicator size="large" color={colors.primary} />
          )}
          {error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : (
            <ScrollView
              ref={scrollViewRef}
              style={styles.transcriptScroll}
              contentContainerStyle={styles.transcriptScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.transcript}>{displayText}</Text>
            </ScrollView>
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
    width: '92%',
    maxHeight: '75%',
    minHeight: 320,
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    ...shadows.medium,
    ...(Platform.OS === 'android' ? { elevation: 8 } : {}),
  },
  durationText: {
    ...typography.h3,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  micLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 160,
  },
  transcriptScroll: {
    alignSelf: 'stretch',
    flex: 1,
  },
  transcriptScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: spacing.xs,
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
    marginTop: spacing.md,
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
