import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { AdminService, type User } from '../services/AdminService';
import { AuthService } from '../services/AuthService';
import { colors, spacing, borderRadius, typography } from '../constants/Theme';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../app/_layout';

type EditUserModalNavigationProp = StackNavigationProp<RootStackParamList>;

interface EditUserModalProps {
  visible: boolean;
  user: User;
  onClose: () => void;
  onUserUpdated: () => void;
}

/**
 * Edit User Modal Component
 * Allows editing user role and expiration date
 */
export function EditUserModal({ visible, user, onClose, onUserUpdated }: EditUserModalProps) {
  const navigation = useNavigation<EditUserModalNavigationProp>();
  const [role, setRole] = useState<'basic' | 'admin'>(user.role || 'basic');
  const [expirationDate, setExpirationDate] = useState<Date | null>(
    user.expirationDate ? new Date(user.expirationDate * 1000) : null
  );
  const [noExpiration, setNoExpiration] = useState(!user.expirationDate);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setRole(user.role || 'basic');
      setExpirationDate(user.expirationDate ? new Date(user.expirationDate * 1000) : null);
      setNoExpiration(!user.expirationDate);
    }
  }, [visible, user]);

  const handleSave = async () => {
    try {
      setSaving(true);

      const updates: any = {
        role,
      };

      if (noExpiration) {
        updates.expirationDate = null;
        console.log('[EditUserModal] Setting expirationDate to null (noExpiration=true)');
      } else if (expirationDate) {
        try {
          // Get date components in Pacific timezone
          const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/Los_Angeles',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          });
          
          const parts = formatter.formatToParts(expirationDate);
          const year = parts.find(p => p.type === 'year')?.value;
          const month = parts.find(p => p.type === 'month')?.value;
          const day = parts.find(p => p.type === 'day')?.value;
          
          if (!year || !month || !day) {
            throw new Error('Failed to parse date components');
          }
          
          // Create ISO string for midnight Pacific time
          // Format: YYYY-MM-DDTHH:MM:SS-08:00 (PST, UTC-8)
          // Note: This doesn't account for DST, but it's close enough for expiration dates
          const pacificMidnightISO = `${year}-${month}-${day}T00:00:00-08:00`;
          const pacificDate = new Date(pacificMidnightISO);
          
          const timestamp = Math.floor(pacificDate.getTime() / 1000);
          
          console.log('[EditUserModal] Converting expiration date:', {
            originalDate: expirationDate.toISOString(),
            year,
            month,
            day,
            pacificMidnightISO,
            pacificDate: pacificDate.toISOString(),
            timestamp,
            timestampDate: new Date(timestamp * 1000).toISOString()
          });
          
          // Validate timestamp
          if (isNaN(timestamp) || timestamp <= 0) {
            throw new Error(`Invalid timestamp: ${timestamp}`);
          }
          
          updates.expirationDate = timestamp;
        } catch (error: any) {
          console.error('[EditUserModal] Error converting expiration date:', error);
          Alert.alert('Error', `Failed to set expiration date: ${error.message}`);
          setSaving(false);
          return;
        }
      } else {
        console.log('[EditUserModal] No expirationDate set (expirationDate is null/undefined)');
      }
      
      console.log('[EditUserModal] Final updates object:', JSON.stringify(updates, null, 2));

      // Reactivate if user is deactivated
      if (user.isDeactivated) {
        updates.reactivate = true;
      }

      await AdminService.updateUser(user.userId, updates);
      Alert.alert('Success', 'User updated successfully');
      onUserUpdated();
    } catch (error: any) {
      console.error('Error updating user:', error);
      if (error.isExpirationError) {
        Alert.alert(
          'Account Expired',
          error.message || 'Your account has expired. You can no longer use the app.',
          [
            {
              text: 'OK',
              onPress: async () => {
                await AuthService.clearSession();
                navigation.reset({
                  index: 0,
                  routes: [{ name: 'Login' }],
                });
              },
            },
          ]
        );
      } else {
        Alert.alert('Error', 'Failed to update user. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    // Always hide the picker after interaction
    setShowDatePicker(false);
    
    if (selectedDate) {
      setExpirationDate(selectedDate);
      setNoExpiration(false);
    }
  };

  const formatDateForDisplay = (date: Date | null): string => {
    if (!date) return 'No expiration';
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'America/Los_Angeles',
    });
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
            <Text style={styles.title}>Edit User</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            <Text style={styles.label}>Email</Text>
            <Text style={styles.emailText}>{user.email}</Text>

            <Text style={styles.label}>Role</Text>
            <View style={styles.roleContainer}>
              <TouchableOpacity
                style={[styles.roleButton, role === 'basic' && styles.roleButtonActive]}
                onPress={() => setRole('basic')}
                activeOpacity={0.7}
              >
                <Text style={[styles.roleButtonText, role === 'basic' && styles.roleButtonTextActive]}>
                  Basic
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.roleButton, role === 'admin' && styles.roleButtonActive]}
                onPress={() => setRole('admin')}
                activeOpacity={0.7}
              >
                <Text style={[styles.roleButtonText, role === 'admin' && styles.roleButtonTextActive]}>
                  Admin
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Expiration Date</Text>
            <TouchableOpacity
              style={styles.checkboxContainer}
              onPress={() => {
                const newNoExpiration = !noExpiration;
                setNoExpiration(newNoExpiration);
                if (newNoExpiration) {
                  // If checking "no expiration", clear the date
                  setExpirationDate(null);
                } else {
                  // If unchecking "no expiration", initialize with a default date if null
                  if (!expirationDate) {
                    setExpirationDate(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)); // Default to 2 weeks from now
                  }
                }
              }}
              activeOpacity={0.7}
            >
              <Ionicons
                name={noExpiration ? 'checkbox' : 'square-outline'}
                size={24}
                color={noExpiration ? colors.primary : colors.textSecondary}
              />
              <Text style={styles.checkboxLabel}>No expiration</Text>
            </TouchableOpacity>

            {!noExpiration && (
              <>
                <TouchableOpacity
                  style={styles.dateButton}
                  onPress={() => {
                    // Ensure we have a valid date before showing picker
                    if (!expirationDate) {
                      setExpirationDate(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000));
                    }
                    setShowDatePicker(true);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.dateButtonText}>
                    {formatDateForDisplay(expirationDate)}
                  </Text>
                  <Ionicons name="calendar-outline" size={20} color={colors.primary} />
                </TouchableOpacity>

                {showDatePicker && (
                  <View style={styles.datePickerWrapper}>
                    <DateTimePicker
                      value={expirationDate || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'inline' : 'default'}
                      onChange={handleDateChange}
                      minimumDate={new Date()}
                      style={Platform.OS === 'ios' ? styles.iosDatePicker : undefined}
                    />
                    {Platform.OS === 'ios' && (
                      <TouchableOpacity
                        style={styles.doneButton}
                        onPress={() => setShowDatePicker(false)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.doneButtonText}>Done</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </>
            )}

            {user.isDeactivated && (
              <View style={styles.deactivatedWarning}>
                <Ionicons name="warning-outline" size={20} color={colors.error} />
                <Text style={styles.deactivatedText}>
                  This user is deactivated. Saving will reactivate them.
                </Text>
              </View>
            )}

            <View style={styles.actions}>
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
    maxHeight: '80%',
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
  label: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  emailText: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  roleContainer: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  roleButton: {
    flex: 1,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  roleButtonActive: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  roleButtonText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  roleButtonTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  checkboxLabel: {
    ...typography.body,
    color: colors.textPrimary,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginBottom: spacing.md,
  },
  dateButtonText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  datePickerWrapper: {
    marginBottom: spacing.md,
  },
  iosDatePicker: {
    width: '100%',
    height: 200,
  },
  doneButton: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    alignSelf: 'flex-end',
  },
  doneButtonText: {
    ...typography.body,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  deactivatedWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.error + '20',
    borderRadius: borderRadius.md,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  deactivatedText: {
    ...typography.body,
    color: colors.error,
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  button: {
    flex: 1,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
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

