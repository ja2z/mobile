import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { AuthService } from '../../services/AuthService';
import { colors, spacing, borderRadius, typography } from '../../constants/Theme';

type Step = 'phone' | 'code';

/**
 * Phone Verification Screen
 * Step 1: Enter US phone number (+1 only)
 * Step 2: Enter 5-digit SMS code
 */
export default function PhoneVerification() {
  const navigation = useNavigation();

  const [step, setStep] = useState<Step>('phone');
  const [phoneDigits, setPhoneDigits] = useState(''); // 10-digit US number, no prefix
  const [verificationCode, setVerificationCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Format raw 10 digits into (XXX) XXX-XXXX for display
  function formatDisplay(digits: string): string {
    const d = digits.replace(/\D/g, '').slice(0, 10);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }

  function toE164(digits: string): string {
    return `+1${digits.replace(/\D/g, '').slice(0, 10)}`;
  }

  const phoneComplete = phoneDigits.length === 10;

  function handlePhoneChange(text: string) {
    // Keep only digits, max 10
    const digits = text.replace(/\D/g, '').slice(0, 10);
    setPhoneDigits(digits);
    setError(null);
  }

  /**
   * Build a local date/time string from API `nextAllowedAt`.
   * Handles Unix seconds (~1e9) vs milliseconds (~1e12) and rejects invalid values
   * so we never show "Invalid Date".
   */
  function formatNextAllowedAt(raw: unknown): string | null {
    if (raw == null) return null;
    const n =
      typeof raw === 'number'
        ? raw
        : typeof raw === 'string'
          ? parseFloat(raw)
          : NaN;
    if (!Number.isFinite(n) || n <= 0) return null;
    // Seconds vs ms: current epoch seconds ~1.7e9; ms ~1.7e12
    const ms = n >= 1e12 ? n : n * 1000;
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  /** User-friendly copy for 403 phone_change_cooldown from the API */
  function phoneCooldownMessage(err: any): string | null {
    const isCooldown =
      err?.code === 'phone_change_cooldown' ||
      err?.message === 'phone_change_cooldown';

    const when = formatNextAllowedAt(err?.nextAllowedAt);
    if (when) {
      return `You can change your phone number on or after ${when}.`;
    }

    if (isCooldown) {
      return err.message || 'You must wait before changing your phone number again.';
    }
    return null;
  }

  async function handleSendCode() {
    const digits = phoneDigits.replace(/\D/g, '');
    if (digits.length !== 10) {
      setError('Please enter a valid 10-digit US phone number.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await AuthService.validatePhone(toE164(digits));
      setStep('code');
    } catch (err: any) {
      const cooldown = phoneCooldownMessage(err);
      if (cooldown) {
        setError(cooldown);
      } else if (err.message?.includes('expired') || err.message?.includes('session')) {
        Alert.alert('Session Expired', 'Please sign in again.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      } else {
        setError(err.message || 'Failed to send verification code. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyCode() {
    if (verificationCode.length !== 5) {
      setError('Please enter the 5-digit code from your SMS.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await AuthService.verifyPhone(toE164(phoneDigits), verificationCode);
      Alert.alert('Phone Verified', 'Your phone number has been verified successfully.', [
        {
          text: 'OK',
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (err: any) {
      const cooldown = phoneCooldownMessage(err);
      if (cooldown) {
        setError(cooldown);
      } else if (err.message?.includes('Verification code')) {
        // Before generic "expired" — API uses "Verification code not found or expired" for wrong code too
        setError('Incorrect or expired code. Please try again.');
      } else if (err.message?.includes('expired') || err.message?.includes('session')) {
        Alert.alert('Session Expired', 'Please sign in again.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      } else if (err.message?.includes('not found')) {
        setError('Incorrect or expired code. Please try again.');
      } else {
        setError(err.message || 'Verification failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <Ionicons name="phone-portrait-outline" size={32} color={colors.primary} />
            </View>
            <Text style={styles.title}>
              {step === 'phone' ? 'Verify Your Phone' : 'Enter Verification Code'}
            </Text>
            <Text style={styles.subtitle}>
              {step === 'phone'
                ? 'Enter your US phone number to receive a verification code by SMS. This enables SMS notifications from Sigma workbooks.'
                : `We sent a 5-digit code to +1 ${formatDisplay(phoneDigits)}. Enter it below.`}
            </Text>
          </View>

          {/* Input */}
          {step === 'phone' ? (
            <View style={styles.inputGroup}>
              <View style={styles.phoneRow}>
                <View style={styles.countryBadge}>
                  <Text style={styles.countryFlag}>🇺🇸</Text>
                  <Text style={styles.countryCode}>+1</Text>
                </View>
                <TextInput
                  style={styles.phoneInput}
                  value={formatDisplay(phoneDigits)}
                  onChangeText={handlePhoneChange}
                  placeholder="(555) 555-5555"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="phone-pad"
                  autoFocus
                  maxLength={14}
                  maxFontSizeMultiplier={1.35}
                />
              </View>
            </View>
          ) : (
            <View style={styles.inputGroup}>
              <TextInput
                style={styles.codeInput}
                value={verificationCode}
                onChangeText={(t) => { setVerificationCode(t.replace(/\D/g, '').slice(0, 5)); setError(null); }}
                placeholder="- - - - -"
                placeholderTextColor={colors.textSecondary}
                keyboardType="number-pad"
                autoFocus
                maxLength={5}
                textAlign="center"
              />
            </View>
          )}

          {/* Error */}
          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Primary action */}
          <TouchableOpacity
            style={[
              styles.primaryButton,
              (loading || (step === 'phone' && !phoneComplete)) && styles.buttonDisabled,
            ]}
            onPress={step === 'phone' ? handleSendCode : handleVerifyCode}
            disabled={loading || (step === 'phone' && !phoneComplete)}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {step === 'phone' ? 'Send Code' : 'Verify'}
              </Text>
            )}
          </TouchableOpacity>

          {/* Back/resend */}
          {step === 'code' && (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => { setStep('phone'); setVerificationCode(''); setError(null); }}
              disabled={loading}
            >
              <Text style={styles.secondaryButtonText}>Use a different number</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => navigation.goBack()}
            disabled={loading}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, padding: spacing.lg },
  header: { alignItems: 'center', marginBottom: spacing.xl },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  inputGroup: { marginBottom: spacing.md },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    maxWidth: '100%',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  countryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    gap: 4,
  },
  countryFlag: { fontSize: 20 },
  countryCode: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
  phoneInput: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    ...typography.body,
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 18,
    lineHeight: 24,
  },
  codeInput: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    fontSize: 32,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 12,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    marginBottom: spacing.md,
    gap: 6,
  },
  errorText: { ...typography.caption, color: colors.error, flex: 1 },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.sm,
    minHeight: 52,
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  primaryButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  secondaryButton: { alignItems: 'center', paddingVertical: spacing.sm, marginBottom: spacing.xs },
  secondaryButtonText: { ...typography.body, color: colors.primary },
  cancelButton: { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.xs },
  cancelButtonText: { ...typography.body, color: colors.textSecondary },
});
