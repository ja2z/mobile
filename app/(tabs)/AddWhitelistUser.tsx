import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { AdminService } from '../../services/AdminService';
import { AuthService } from '../../services/AuthService';
import { colors, spacing, borderRadius, typography } from '../../constants/Theme';
import type { RootStackParamList } from '../_layout';

type AddWhitelistUserScreenNavigationProp = StackNavigationProp<RootStackParamList, 'AddWhitelistUser'>;

/**
 * Add Whitelist User Screen Component
 * Allows adding a new user to the whitelist
 */
export default function AddWhitelistUser() {
  const navigation = useNavigation<AddWhitelistUserScreenNavigationProp>();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'basic' | 'admin'>('basic');
  const [expirationDate, setExpirationDate] = useState<Date>(
    new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) // Default to 2 weeks from now
  );
  const [noExpiration, setNoExpiration] = useState(false);
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
    if (!email || !isValidEmail(email)) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    try {
      setSaving(true);

      const expirationTimestamp = noExpiration
        ? undefined
        : Math.floor(expirationDate.getTime() / 1000);

      await AdminService.addWhitelistUser(email, role, expirationTimestamp, noExpiration);
      Alert.alert('Success', 'Whitelist user added successfully', [
        {
          text: 'OK',
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (error: any) {
      console.error('Error adding whitelist user:', error);
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
        Alert.alert('Error', error.message || 'Failed to add whitelist user. Please try again.');
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

  const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const formatDateForDisplay = (date: Date): string => {
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
        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.input}
            placeholder="user@example.com"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholderTextColor={colors.textSecondary}
          />
        </View>

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

        <View style={styles.labelContainer}>
          <Text style={styles.label}>Account Expiration</Text>
          <TouchableOpacity
            onPress={() => {
              Alert.alert(
                'Account Expiration',
                'This date serves two purposes:\n\n' +
                '• Sign-up deadline: User must register before this date\n' +
                '• Account expiration: If they register, their account expires on this date\n\n' +
                'If "No expiration" is selected, the user can sign up anytime and their account will never expire.',
                [{ text: 'Got it', style: 'default' }]
              );
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.7}
          >
            <Ionicons name="information-circle-outline" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={styles.checkboxContainer}
          onPress={() => {
            const newNoExpiration = !noExpiration;
            setNoExpiration(newNoExpiration);
            if (newNoExpiration) {
              // If checking "no expiration", clear the date
              setExpirationDate(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000));
            } else {
              // If unchecking "no expiration", ensure we have a date
              if (!expirationDate) {
                setExpirationDate(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000));
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
                  value={expirationDate}
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
              <Text style={styles.saveButtonText}>Add</Text>
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
  labelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  label: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  inputWrapper: {
    minHeight: 48,
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  input: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    backgroundColor: 'transparent',
    paddingHorizontal: spacing.md,
    paddingTop: 0,
    paddingBottom: 0,
    color: colors.textPrimary,
    minHeight: 48,
    textAlignVertical: 'center',
    includeFontPadding: false,
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

