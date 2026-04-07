import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography, shadows } from '../constants/Theme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface SigmaApiDetectFailedModalProps {
  visible: boolean;
  onClose: () => void;
}

export function SigmaApiDetectFailedModal({ visible, onClose }: SigmaApiDetectFailedModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.overlayTouchable} />
        </TouchableWithoutFeedback>
        <View style={styles.modalContainer}>
          <View style={styles.header}>
            <Ionicons name="alert-circle" size={28} color={colors.warning} />
            <Text style={styles.title}>Could not detect server</Text>
          </View>
          <Text style={styles.body}>
            None of the Sigma REST API regions accepted your credentials. Please verify your REST API Client ID and
            Secret are correct, then try again or pick a server manually from the list.
          </Text>
          <TouchableOpacity style={styles.okButton} onPress={onClose} activeOpacity={0.8}>
            <Text style={styles.okButtonText}>OK</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  overlayTouchable: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalContainer: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    width: '100%',
    maxWidth: 420,
    maxHeight: SCREEN_HEIGHT * 0.55,
    padding: spacing.lg,
    ...shadows.medium,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
    flex: 1,
  },
  body: {
    ...typography.body,
    color: colors.textPrimary,
    lineHeight: 24,
    marginBottom: spacing.lg,
  },
  okButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  okButtonText: {
    ...typography.body,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
