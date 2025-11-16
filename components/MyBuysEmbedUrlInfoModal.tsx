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

interface MyBuysEmbedUrlInfoModalProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * My Buys Embed URL Info Modal Component
 * Explains what an embed URL is and how to get one
 */
export function MyBuysEmbedUrlInfoModal({ visible, onClose }: MyBuysEmbedUrlInfoModalProps) {
  const handleOpenSandbox = () => {
    Linking.openURL('https://help.sigmacomputing.com/docs/test-an-embed-url-in-the-embed-sandbox');
  };

  const exampleUrl = 'https://app.sigmacomputing.com/papercrane/workbook/78Lo8GxroffXtpzUGFX5ak?:jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImU2YzhlMGM1YTA4MWFmYzQ1ODU2OTNmMGIzYWQ0NWZhNTBmNDQ2ZWMyODZmZWZhOThkYzRmNGUwMjM5ZGM5ODgifQ.eyJzdWIiOiJqb25Ac2lnbWFjb21wdXRpbmcuY29tIiwiYXVkIjoic2lnbWFjb21wdXRpbmciLCJ2ZXIiOiIxLjEiLCJqdGkiOiI4ZDEzNjRiNS1jM2UyLTRiNzktOTRlNi1jNTI4ODU5MWI1ZDMiLCJpYXQiOjE3NjMyNDM4NDUsImV4cCI6MTc2MzI0NzQ0NSwiaXNzIjoiZTZjOGUwYzVhMDgxYWZjNDU4NTY5M2YwYjNhZDQ1ZmE1MGY0NDZlYzI4NmZlZmE5OGRjNGY0ZTAyMzlkYzk4OCJ9.ch_yoTJ_mO5A4SAWEHfpV1m-bl3aNPTnxF6ak&:embed=true&:menu_position=bottom';

  // Truncate JWT in the middle for display
  const truncateJWT = (url: string): string => {
    const jwtMatch = url.match(/([?&]:jwt=)([^&]+)/);
    if (jwtMatch && jwtMatch[2]) {
      const jwt = jwtMatch[2];
      const parts = jwt.split('.');
      if (parts.length === 3) {
        const header = parts[0];
        const payload = parts[1];
        const signature = parts[2];
        
        // Truncate payload in the middle
        const payloadStart = payload.substring(0, 20);
        const payloadEnd = payload.substring(payload.length - 20);
        const truncatedPayload = `${payloadStart}...${payloadEnd}`;
        
        const truncatedJWT = `${header}.${truncatedPayload}.${signature}`;
        return url.replace(jwtMatch[2], truncatedJWT);
      }
    }
    return url;
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
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerIconContainer}>
              <Ionicons name="information-circle" size={24} color={colors.info} />
            </View>
            <Text style={styles.headerTitle}>Embed URL</Text>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              accessibilityLabel="Close modal"
            >
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <ScrollView 
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={true}
          >
            <Text style={styles.descriptionText}>
              An embed URL is a fully working Sigma workbook embed URL that you want to use as a template.
              This URL should include a JWT (JSON Web Token) for authentication.
            </Text>

            <View style={styles.exampleSection}>
              <Text style={styles.sectionTitle}>Example URL:</Text>
              <View style={styles.exampleContainer}>
                <Text style={styles.exampleText} selectable>
                  {truncateJWT(exampleUrl)}
                </Text>
              </View>
            </View>

            <View style={styles.helpSection}>
              <Text style={styles.sectionTitle}>Need help getting an embed URL?</Text>
              <TouchableOpacity
                style={styles.linkButton}
                onPress={handleOpenSandbox}
                activeOpacity={0.7}
              >
                <Ionicons name="open-outline" size={20} color={colors.info} />
                <Text style={styles.linkText}>
                  Test an embed URL in the embed sandbox
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.noteSection}>
              <Ionicons name="information-circle-outline" size={20} color={colors.textSecondary} />
              <Text style={styles.noteText}>
                The JWT in your embed URL will be regenerated with your credentials when you view the applet.
              </Text>
            </View>
          </ScrollView>
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
    maxHeight: SCREEN_HEIGHT * 0.8,
    ...shadows.medium,
    overflow: 'hidden',
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
  exampleSection: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  exampleContainer: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  exampleText: {
    ...typography.bodySmall,
    fontFamily: 'monospace',
    color: colors.textPrimary,
    lineHeight: 20,
  },
  helpSection: {
    marginBottom: spacing.lg,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    marginTop: spacing.sm,
  },
  linkText: {
    ...typography.body,
    color: colors.info,
    marginLeft: spacing.sm,
    textDecorationLine: 'underline',
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

