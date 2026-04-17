import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AdminService } from '../services/AdminService';
import {
  invalidateBuiltInAppletsCache,
  type BuiltInApplet,
} from '../services/BuiltInAppletsService';
import {
  resolveColorHexForSave,
  themeFromStoredColor,
  getAppletAccentColor,
  type AppletThemeId,
} from '../constants/AppletThemes';
import { MyBuysThemeSelector } from './MyBuysThemeSelector';
import { colors, spacing, borderRadius, typography } from '../constants/Theme';

interface EditBuiltInAppletColorModalProps {
  visible: boolean;
  applet: BuiltInApplet | null;
  onClose: () => void;
  onSaved: (updatedColor: string | null) => void;
}

/**
 * Edit Built-In Applet Color Modal
 * Admin-only: lets an admin pick / customize the global accent color for a
 * built-in applet. Persists to built_in_applets.color via AdminService.
 */
export function EditBuiltInAppletColorModal({
  visible,
  applet,
  onClose,
  onSaved,
}: EditBuiltInAppletColorModalProps) {
  const [themeId, setThemeId] = useState<AppletThemeId>('teal');
  const [customHex, setCustomHex] = useState<string>('#');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible || !applet) return;
    const seed = themeFromStoredColor(applet.color);
    setThemeId(seed.themeId);
    setCustomHex(seed.themeCustomHex || '#');
  }, [visible, applet]);

  const previewAccent = getAppletAccentColor(themeId, customHex);

  const handleSave = async () => {
    if (!applet) return;
    const hex = resolveColorHexForSave(themeId, customHex);
    if (!hex) {
      Alert.alert(
        'Invalid color',
        'Enter a valid 6-digit hex (e.g. #A855F7) or pick a preset.'
      );
      return;
    }
    try {
      setSaving(true);
      await AdminService.updateBuiltInAppletColor(applet.applet_id, hex);
      invalidateBuiltInAppletsCache();
      onSaved(hex);
    } catch (err: any) {
      console.error('[EditBuiltInAppletColorModal] save failed', err);
      Alert.alert('Could not save color', err?.message || 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!applet) return;
    Alert.alert(
      'Reset to default?',
      `Clear the global color for "${applet.name}"? Tiles will fall back to the default accent.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              setSaving(true);
              await AdminService.updateBuiltInAppletColor(applet.applet_id, null);
              invalidateBuiltInAppletsCache();
              onSaved(null);
            } catch (err: any) {
              console.error('[EditBuiltInAppletColorModal] reset failed', err);
              Alert.alert('Could not reset color', err?.message || 'Unknown error');
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>Applet color</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            {applet && (
              <View style={styles.appletRow}>
                <View
                  style={[
                    styles.iconBubble,
                    { backgroundColor: previewAccent },
                  ]}
                >
                  <Ionicons
                    name={
                      (applet.icon_name as keyof typeof Ionicons.glyphMap) ||
                      'grid-outline'
                    }
                    size={20}
                    color="#FFFFFF"
                  />
                </View>
                <View style={styles.appletText}>
                  <Text style={styles.appletName} numberOfLines={1}>
                    {applet.name}
                  </Text>
                  {!!applet.subtitle && (
                    <Text style={styles.appletSubtitle} numberOfLines={1}>
                      {applet.subtitle}
                    </Text>
                  )}
                </View>
              </View>
            )}

            <MyBuysThemeSelector
              themeId={themeId}
              customHex={customHex}
              onThemeIdChange={setThemeId}
              onCustomHexChange={setCustomHex}
            />

            <Text style={styles.helpText}>
              This color is global. Everyone using the app will see it on this
              applet&apos;s tile and screen header.
            </Text>

            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.button, styles.resetButton]}
                onPress={handleReset}
                disabled={saving || !applet?.color}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.resetButtonText,
                    !applet?.color && styles.resetButtonTextDisabled,
                  ]}
                >
                  Reset
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={onClose}
                disabled={saving}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.saveButton]}
                onPress={handleSave}
                disabled={saving}
                activeOpacity={0.7}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveButtonText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
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
  modal: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    width: '100%',
    maxWidth: 500,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  closeButton: {
    padding: spacing.sm,
  },
  content: {
    padding: spacing.lg,
  },
  appletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  iconBubble: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appletText: {
    flex: 1,
  },
  appletName: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  appletSubtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  helpText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  button: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  resetButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
  },
  resetButtonText: {
    ...typography.body,
    color: colors.error,
    fontWeight: '600',
  },
  resetButtonTextDisabled: {
    color: colors.textSecondary,
  },
  cancelButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelButtonText: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: colors.primary,
  },
  saveButtonText: {
    ...typography.body,
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
