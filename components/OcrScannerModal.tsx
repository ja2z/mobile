import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import TextRecognition, { TextRecognitionResult } from '@react-native-ml-kit/text-recognition';
import { Config } from '../constants/Config';
import { colors, spacing, typography } from '../constants/Theme';

export type OcrFormat = 'text' | 'json';

type OcrScannerModalProps = {
  visible: boolean;
  format: OcrFormat;
  onClose: () => void;
  /** Called with the formatted OCR payload when the user confirms Send. */
  onScanned: (payload: string) => void;
};

type Stage = 'aim' | 'processing' | 'review';

export function OcrScannerModal({ visible, format, onClose, onScanned }: OcrScannerModalProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [stage, setStage] = useState<Stage>('aim');
  const [recognized, setRecognized] = useState<TextRecognitionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setStage('aim');
      setRecognized(null);
      setError(null);
    }
  }, [visible]);

  const handleRequestPermission = useCallback(() => {
    requestPermission();
  }, [requestPermission]);

  const captureAndRecognize = useCallback(async () => {
    if (!cameraRef.current) return;
    setStage('processing');
    setError(null);
    try {
      const picture = await cameraRef.current.takePictureAsync({ skipProcessing: false });
      if (!picture?.uri) {
        setError('Could not capture photo.');
        setStage('review');
        return;
      }
      const result = await TextRecognition.recognize(picture.uri);
      setRecognized(result);
      setStage('review');
    } catch (err) {
      console.error('OCR error:', err);
      const msg = err instanceof Error ? err.message : 'Text recognition failed.';
      setError(msg);
      setRecognized(null);
      setStage('review');
    }
  }, []);

  const handleRetake = useCallback(() => {
    setRecognized(null);
    setError(null);
    setStage('aim');
  }, []);

  const handleSend = useCallback(() => {
    if (!recognized || !recognized.text) return;
    const payload = format === 'json' ? serializeAsJson(recognized) : recognized.text;
    onScanned(payload);
  }, [recognized, format, onScanned]);

  const hasText = !!recognized?.text;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        {!permission ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.hint}>Checking camera access…</Text>
          </View>
        ) : !permission.granted ? (
          <View style={styles.centered}>
            <Text style={styles.title}>Camera required</Text>
            <Text style={styles.hint}>
              {Config.APP_NAME} needs camera access to capture text for this workbook.
            </Text>
            <Pressable
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
              onPress={handleRequestPermission}
            >
              <Text style={styles.primaryButtonText}>Allow camera</Text>
            </Pressable>
            <Pressable style={styles.textButton} onPress={onClose}>
              <Text style={styles.textButtonLabel}>Cancel</Text>
            </Pressable>
          </View>
        ) : stage === 'aim' ? (
          <>
            <CameraView ref={cameraRef} style={styles.camera} facing="back" />
            <View style={styles.footer}>
              <Text style={styles.footerHint}>Aim the camera at the text and tap to capture</Text>
              <Pressable
                style={({ pressed }) => [styles.shutter, pressed && styles.pressed]}
                onPress={captureAndRecognize}
                accessibilityLabel="Capture photo for text recognition"
              >
                <View style={styles.shutterInner} />
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.cancelBar, pressed && styles.pressed]}
                onPress={onClose}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
            </View>
          </>
        ) : stage === 'processing' ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#FFFFFF" />
            <Text style={styles.processingHint}>Recognizing text…</Text>
          </View>
        ) : (
          <View style={styles.reviewRoot}>
            <Text style={styles.reviewTitle}>
              {error ? 'Recognition failed' : hasText ? 'Review captured text' : 'No text detected'}
            </Text>
            <ScrollView style={styles.reviewScroll} contentContainerStyle={styles.reviewContent}>
              {error ? (
                <Text style={styles.reviewError}>{error}</Text>
              ) : hasText ? (
                <Text style={styles.reviewText}>{recognized!.text}</Text>
              ) : (
                <Text style={styles.reviewPlaceholder}>
                  Try again with better lighting or a closer crop.
                </Text>
              )}
            </ScrollView>
            <View style={styles.reviewActions}>
              {hasText && !error ? (
                <Pressable
                  style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
                  onPress={handleSend}
                >
                  <Text style={styles.primaryButtonText}>Send</Text>
                </Pressable>
              ) : null}
              <Pressable
                style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
                onPress={handleRetake}
              >
                <Text style={styles.secondaryButtonText}>Retake</Text>
              </Pressable>
              <Pressable style={styles.textButton} onPress={onClose}>
                <Text style={styles.textButtonLabel}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

function serializeAsJson(result: TextRecognitionResult): string {
  return JSON.stringify({
    text: result.text,
    blocks: result.blocks.map((b) => ({
      text: b.text,
      frame: b.frame,
      lines: b.lines.map((l) => ({ text: l.text, frame: l.frame })),
    })),
  });
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.background,
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  hint: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  processingHint: {
    ...typography.body,
    color: '#F9FAFB',
    textAlign: 'center',
    marginTop: spacing.md,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
  },
  footerHint: {
    ...typography.caption,
    color: '#F9FAFB',
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  shutterInner: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#FFFFFF',
  },
  cancelBar: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelText: {
    ...typography.body,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  reviewRoot: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.lg,
  },
  reviewTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  reviewScroll: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reviewContent: {
    padding: spacing.md,
  },
  reviewText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  reviewError: {
    ...typography.body,
    color: colors.error,
  },
  reviewPlaceholder: {
    ...typography.body,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  reviewActions: {
    marginTop: spacing.md,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: 10,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  primaryButtonText: {
    ...typography.body,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  secondaryButton: {
    backgroundColor: colors.surface,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: 10,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  secondaryButtonText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  textButton: {
    marginTop: spacing.xs,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textButtonLabel: {
    ...typography.body,
    color: colors.primaryDark,
  },
  pressed: {
    opacity: 0.85,
  },
});
