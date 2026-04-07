import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ScrollView,
  Linking,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography, shadows } from '../constants/Theme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface RestApiInfoModalProps {
  visible: boolean;
  onClose: () => void;
}

export function RestApiInfoModal({ visible, onClose }: RestApiInfoModalProps) {
  const handleOpenDocs = () => {
    Linking.openURL('https://help.sigmacomputing.com/reference/token');
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.overlayTouchable} />
        </TouchableWithoutFeedback>
        <View style={styles.modalContainer}>
          <View style={styles.header}>
            <View style={styles.headerIconContainer}>
              <Ionicons name="information-circle" size={24} color={colors.info} />
            </View>
            <Text style={styles.headerTitle}>Sigma REST API</Text>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              accessibilityLabel="Close modal"
            >
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={styles.contentWrapper}>
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={true}
            >
              <Text style={styles.descriptionText}>
                The Sigma REST API lets you fetch workbook metadata such as page names. This enables a custom native page footer for your applet.
              </Text>

              <Text style={styles.descriptionText}>
                REST API credentials are separate from Embed credentials, but they can be the same. Use the "Same as Embed Key" checkbox if your API key pair matches your embed credentials.
              </Text>

              <View style={styles.helpSection}>
                <Text style={styles.sectionTitle}>How to get REST API credentials:</Text>
                <Text style={styles.stepText}>1. Go to Sigma Admin → APIs & Embed Secrets</Text>
                <Text style={styles.stepText}>2. Create an API client (or use an existing one)</Text>
                <Text style={styles.stepText}>3. Copy the Client ID and Secret</Text>
                <TouchableOpacity
                  style={styles.linkButton}
                  onPress={handleOpenDocs}
                  activeOpacity={0.7}
                >
                  <Ionicons name="open-outline" size={20} color={colors.info} />
                  <Text style={styles.linkText}>Sigma REST API docs</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.noteSection}>
                <Ionicons name="information-circle-outline" size={20} color={colors.textSecondary} />
                <Text style={styles.noteText}>
                  REST API credentials are optional. They are only needed if you want a custom page footer on this applet.
                </Text>
              </View>
            </ScrollView>
          </View>
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
    maxWidth: 500,
    height: SCREEN_HEIGHT * 0.7,
    maxHeight: SCREEN_HEIGHT * 0.8,
    ...shadows.medium,
    overflow: 'hidden',
    flexDirection: 'column',
  },
  contentWrapper: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerIconContainer: {
    marginRight: spacing.sm,
  },
  headerTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    flex: 1,
  },
  closeButton: {
    padding: spacing.sm,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
  },
  descriptionText: {
    ...typography.body,
    color: colors.textPrimary,
    lineHeight: 24,
    marginBottom: spacing.lg,
  },
  helpSection: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  stepText: {
    ...typography.body,
    color: colors.textPrimary,
    lineHeight: 24,
    marginLeft: spacing.sm,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.info,
    marginTop: spacing.sm,
  },
  linkText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.info,
    marginLeft: spacing.sm,
    flex: 1,
  },
  noteSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.md,
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.md,
    marginTop: spacing.md,
  },
  noteText: {
    ...typography.bodySmall,
    color: colors.textPrimary,
    marginLeft: spacing.sm,
    flex: 1,
    lineHeight: 20,
  },
});
