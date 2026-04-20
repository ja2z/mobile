import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
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
  /** Called with the updated applet after a successful save. */
  onSaved: (updated: BuiltInApplet) => void;
}

const NAME_MAX_LENGTH = 120;
const SUBTITLE_MAX_LENGTH = 240;

/**
 * Edit Built-In Applet Modal
 * Admin-only: lets an admin update the global display name, subtitle, and
 * accent color for a built-in applet. Persists to built_in_applets via
 * AdminService in a single call on Save.
 */
export function EditBuiltInAppletColorModal({
  visible,
  applet,
  onClose,
  onSaved,
}: EditBuiltInAppletColorModalProps) {
  const [themeId, setThemeId] = useState<AppletThemeId>('teal');
  const [customHex, setCustomHex] = useState<string>('#');
  const [name, setName] = useState<string>('');
  const [subtitle, setSubtitle] = useState<string>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible || !applet) return;
    const seed = themeFromStoredColor(applet.color);
    setThemeId(seed.themeId);
    setCustomHex(seed.themeCustomHex || '#');
    setName(applet.name ?? '');
    setSubtitle(applet.subtitle ?? '');
  }, [visible, applet]);

  const previewAccent = getAppletAccentColor(themeId, customHex);
  const trimmedName = name.trim();
  const trimmedSubtitle = subtitle.trim();
  const nameChanged = !!applet && trimmedName !== (applet.name ?? '');
  const subtitleChanged =
    !!applet && trimmedSubtitle !== (applet.subtitle ?? '');

  const handleSave = async () => {
    if (!applet) return;

    if (!trimmedName) {
      Alert.alert('Name required', 'Please enter an applet name.');
      return;
    }

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
      const updates: {
        name?: string;
        subtitle?: string | null;
        color?: string | null;
      } = { color: hex };

      if (nameChanged) updates.name = trimmedName;
      if (subtitleChanged) {
        updates.subtitle = trimmedSubtitle ? trimmedSubtitle : null;
      }

      const { applet: updated } = await AdminService.updateBuiltInApplet(
        applet.applet_id,
        updates
      );
      invalidateBuiltInAppletsCache();
      onSaved(updated);
    } catch (err: any) {
      console.error('[EditBuiltInAppletColorModal] save failed', err);
      Alert.alert('Could not save changes', err?.message || 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!applet) return;
    Alert.alert(
      'Reset color to default?',
      `Clear the global color for "${applet.name}"? Tiles will fall back to the default accent.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              setSaving(true);
              const { applet: updated } =
                await AdminService.updateBuiltInApplet(applet.applet_id, {
                  color: null,
                });
              invalidateBuiltInAppletsCache();
              onSaved(updated);
            } catch (err: any) {
              console.error(
                '[EditBuiltInAppletColorModal] reset failed',
                err
              );
              Alert.alert(
                'Could not reset color',
                err?.message || 'Unknown error'
              );
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
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>Edit applet</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
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
                    {trimmedName || applet.name}
                  </Text>
                  {!!trimmedSubtitle && (
                    <Text style={styles.appletSubtitle} numberOfLines={1}>
                      {trimmedSubtitle}
                    </Text>
                  )}
                </View>
              </View>
            )}

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Name</Text>
              <TextInput
                style={styles.textInput}
                value={name}
                onChangeText={setName}
                placeholder="Applet name"
                placeholderTextColor={colors.textSecondary}
                maxLength={NAME_MAX_LENGTH}
                autoCapitalize="words"
                autoCorrect={false}
                editable={!saving}
                returnKeyType="next"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Subtitle</Text>
              <TextInput
                style={[styles.textInput, styles.textInputMultiline]}
                value={subtitle}
                onChangeText={setSubtitle}
                placeholder="Optional short description"
                placeholderTextColor={colors.textSecondary}
                maxLength={SUBTITLE_MAX_LENGTH}
                multiline
                editable={!saving}
              />
              <Text style={styles.helpText}>
                Leave blank to hide the subtitle under this applet&apos;s name.
              </Text>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Color</Text>
              <MyBuysThemeSelector
                themeId={themeId}
                customHex={customHex}
                onThemeIdChange={setThemeId}
                onCustomHexChange={setCustomHex}
              />
              <Text style={styles.helpText}>
                Name, subtitle, and color are global — every user will see
                these changes on this applet&apos;s tile and screen header.
              </Text>
            </View>
          </ScrollView>

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
                Reset color
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
      </KeyboardAvoidingView>
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
    maxHeight: '90%',
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
  scrollArea: {
    flexGrow: 0,
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
  fieldGroup: {
    marginBottom: spacing.lg,
  },
  fieldLabel: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  textInput: {
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 44,
  },
  textInputMultiline: {
    minHeight: 72,
    textAlignVertical: 'top',
    paddingTop: spacing.sm,
  },
  helpText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
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
