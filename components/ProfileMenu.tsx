import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { AuthService } from '../services/AuthService';
import { colors, spacing, borderRadius, typography, shadows } from '../constants/Theme';
import type { RootStackParamList } from '../app/_layout';

interface ProfileMenuProps {
  visible: boolean;
  onClose: () => void;
  onLogout: () => void;
}

type ProfileMenuNavigationProp = StackNavigationProp<RootStackParamList>;

/** Groups a string into chunks of 3 for readability (e.g. bullet runs). */
function groupByThree(s: string): string {
  const chunks = s.match(/.{1,3}/g);
  return chunks ? chunks.join(' ') : s;
}

/**
 * Mask all but last 4 digits. One bullet (•) per hidden digit.
 * US +1 NANP: 10 national digits → +1 ••• ••• 1234 (6 bullets = area + exchange).
 */
function maskPhone(phoneNumber: string): string {
  const digits = phoneNumber.replace(/\D/g, '');
  if (digits.length < 4) return phoneNumber;

  const last4 = digits.slice(-4);

  // US: E.164 +1XXXXXXXXXX (11 digits) or 10-digit national
  let national: string | null = null;
  if (digits.length === 11 && digits[0] === '1') {
    national = digits.slice(1);
  } else if (digits.length === 10) {
    national = digits;
  }
  if (national && national.length === 10) {
    const hidden = national.slice(0, -4);
    const mask = groupByThree('•'.repeat(hidden.length));
    return `+1 ${mask} ${last4}`;
  }

  // Other E.164: show +CC then one • per remaining digit before the last 4 (no double-masking CC)
  const ccMatch = phoneNumber.trim().match(/^\+(\d{1,3})/);
  if (ccMatch && digits.length > ccMatch[1].length + 4) {
    const cc = ccMatch[1];
    const afterCcLen = digits.length - cc.length - 4;
    const mask = groupByThree('•'.repeat(afterCcLen));
    return `+${cc} ${mask} ${last4}`;
  }

  const hidden = digits.slice(0, -4);
  const mask = groupByThree('•'.repeat(hidden.length));
  return `${mask} ${last4}`;
}

/**
 * Profile Menu Component
 * Displays user profile information and logout option
 */
export function ProfileMenu({ visible, onClose, onLogout }: ProfileMenuProps) {
  const navigation = useNavigation<ProfileMenuNavigationProp>();
  const [email, setEmail] = useState<string>('');
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [sessionStartDate, setSessionStartDate] = useState<Date | null>(null);
  const [sessionExpirationDate, setSessionExpirationDate] = useState<Date | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (visible) {
      loadSessionData();
    }
  }, [visible]);

  const loadSessionData = async () => {
    setLoading(true);
    try {
      const session = await AuthService.getSession();
      const startDate = await AuthService.getSessionStartDate();
      const adminStatus = await AuthService.isAdmin();
      // Fetch phone number from Postgres via /auth/me
      const profile = await AuthService.getMe();

      if (session) {
        setEmail(session.user.email);
        setIsAdmin(adminStatus);
        setSessionStartDate(startDate);

        if (session.expiresAt && session.expiresAt > 0) {
          setSessionExpirationDate(new Date(session.expiresAt * 1000));
        }
      }

      setPhoneNumber(profile?.phoneNumber ?? null);
    } catch (error) {
      console.error('Error loading session data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAdminPress = () => {
    onClose();
    navigation.navigate('Admin' as never);
  };

  const handleVerifyPhone = () => {
    onClose();
    navigation.navigate('PhoneVerification' as never);
  };

  const formatDate = (date: Date | null): string => {
    if (!date) return 'Unknown';
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <View style={styles.menuContainer}>
              {/* Header */}
              <View style={styles.header}>
                <Text style={styles.headerTitle}>Profile</Text>
                <TouchableOpacity
                  onPress={onClose}
                  style={styles.closeButton}
                  accessibilityLabel="Close menu"
                >
                  <Ionicons name="close" size={24} color={colors.textPrimary} />
                </TouchableOpacity>
              </View>

              {/* Content */}
              {loading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              ) : (
                <View style={styles.content}>
                  {/* Email */}
                  <View style={styles.infoRow}>
                    <View style={styles.infoIconContainer}>
                      <Ionicons name="mail-outline" size={20} color={colors.primary} />
                    </View>
                    <View style={styles.infoContent}>
                      <Text style={styles.infoLabel}>Email</Text>
                      <Text style={styles.infoValue}>{email || 'Not available'}</Text>
                    </View>
                  </View>

                  {/* Phone */}
                  <View style={styles.infoRow}>
                    <View style={styles.infoIconContainer}>
                      <Ionicons name="phone-portrait-outline" size={20} color={colors.primary} />
                    </View>
                    <View style={styles.infoContent}>
                      <Text style={styles.infoLabel}>Phone</Text>
                      {phoneNumber ? (
                        <View style={styles.phoneRow}>
                          <Text style={styles.infoValue}>{maskPhone(phoneNumber)}</Text>
                          <TouchableOpacity onPress={handleVerifyPhone} style={styles.changePhoneButton}>
                            <Text style={styles.changePhoneText}>Change</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <TouchableOpacity onPress={handleVerifyPhone} activeOpacity={0.7}>
                          <Text style={styles.verifyPhoneLink}>Verify phone number</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>

                  {/* Session Start Date */}
                  <View style={styles.infoRow}>
                    <View style={styles.infoIconContainer}>
                      <Ionicons name="time-outline" size={20} color={colors.primary} />
                    </View>
                    <View style={styles.infoContent}>
                      <Text style={styles.infoLabel}>Session Started</Text>
                      <Text style={styles.infoValue}>
                        {formatDate(sessionStartDate)}
                      </Text>
                    </View>
                  </View>

                  {/* Session Expiration Date */}
                  <View style={styles.infoRow}>
                    <View style={styles.infoIconContainer}>
                      <Ionicons name="calendar-outline" size={20} color={colors.primary} />
                    </View>
                    <View style={styles.infoContent}>
                      <Text style={styles.infoLabel}>Session Expires</Text>
                      <Text style={styles.infoValue}>
                        {formatDate(sessionExpirationDate)}
                      </Text>
                    </View>
                  </View>

                  {/* Admin Button (only for admin users) */}
                  {isAdmin && (
                    <TouchableOpacity
                      style={styles.adminButton}
                      onPress={handleAdminPress}
                      activeOpacity={0.7}
                      accessibilityLabel="Admin"
                      accessibilityRole="button"
                    >
                      <Ionicons name="shield-outline" size={20} color={colors.primary} />
                      <Text style={styles.adminButtonText}>Admin</Text>
                    </TouchableOpacity>
                  )}

                  {/* Logout Button */}
                  <TouchableOpacity
                    style={styles.logoutButton}
                    onPress={onLogout}
                    activeOpacity={0.7}
                    accessibilityLabel="Sign out"
                    accessibilityRole="button"
                  >
                    <Ionicons name="log-out-outline" size={20} color={colors.error} />
                    <Text style={styles.logoutButtonText}>Sign Out</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
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
  menuContainer: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    width: '100%',
    maxWidth: 400,
    ...shadows.medium,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  closeButton: {
    padding: spacing.sm,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    padding: spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: spacing.lg,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.lg,
  },
  infoIconContainer: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoValue: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  verifyPhoneLink: {
    ...typography.body,
    color: colors.primary,
    fontWeight: '500',
  },
  changePhoneButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  changePhoneText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
  },
  adminButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    marginTop: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.background,
  },
  adminButtonText: {
    ...typography.body,
    color: colors.primary,
    fontWeight: '600',
    marginLeft: spacing.sm,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    marginTop: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.error,
    backgroundColor: colors.background,
  },
  logoutButtonText: {
    ...typography.body,
    color: colors.error,
    fontWeight: '600',
    marginLeft: spacing.sm,
  },
});
