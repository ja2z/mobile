import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { AdminService, type User } from '../../services/AdminService';
import { AuthService } from '../../services/AuthService';
import { colors, spacing, borderRadius, typography } from '../../constants/Theme';
import type { RootStackParamList } from '../_layout';

type EditUserScreenNavigationProp = StackNavigationProp<RootStackParamList, 'EditUser'>;
type EditUserScreenRouteProp = RouteProp<RootStackParamList, 'EditUser'>;

/**
 * Edit User Screen Component
 * Allows editing user role and expiration date
 */
export default function EditUser() {
  const navigation = useNavigation<EditUserScreenNavigationProp>();
  const route = useRoute<EditUserScreenRouteProp>();
  const { user } = route.params;

  const [role, setRole] = useState<'basic' | 'admin'>(user.role || 'basic');
  const [expirationDate, setExpirationDate] = useState<Date | null>(
    user.expirationDate ? new Date(user.expirationDate * 1000) : null
  );
  const [noExpiration, setNoExpiration] = useState(!user.expirationDate);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Set navigation header options
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.headerButton}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  const handleSave = async () => {
    try {
      setSaving(true);

      const updates: any = {
        role,
      };

      if (noExpiration) {
        updates.expirationDate = null;
      } else if (expirationDate) {
        // Convert to US/Pacific timezone, then to Unix timestamp
        const pacificDate = new Date(expirationDate.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
        updates.expirationDate = Math.floor(pacificDate.getTime() / 1000);
      }

      // Reactivate if user is deactivated
      if (user.isDeactivated) {
        updates.reactivate = true;
      }

      await AdminService.updateUser(user.userId, updates);
      Alert.alert('Success', 'User updated successfully', [
        {
          text: 'OK',
          onPress: () => navigation.goBack(),
        },
      ]);
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
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
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
                if (showDatePicker) {
                  // If picker is showing, close it
                  setShowDatePicker(false);
                } else {
                  // Ensure we have a valid date before showing picker
                  if (!expirationDate) {
                    setExpirationDate(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000));
                  }
                  setShowDatePicker(true);
                }
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.dateButtonText}>
                {formatDateForDisplay(expirationDate)}
              </Text>
              <Ionicons name={showDatePicker ? "chevron-up" : "calendar-outline"} size={20} color={colors.primary} />
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
            onPress={() => navigation.goBack()}
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
  },
  headerButton: {
    padding: spacing.sm,
    marginLeft: spacing.sm,
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

