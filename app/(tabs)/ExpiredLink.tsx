import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TextInput, 
  TouchableOpacity,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  Image,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { Config } from '../../constants/Config';
import { colors, spacing, borderRadius, typography, shadows } from '../../constants/Theme';
import type { RootStackParamList } from '../_layout';
import { AuthService } from '../../services/AuthService';

type ExpiredLinkScreenNavigationProp = StackNavigationProp<RootStackParamList, 'ExpiredLink'>;

interface ExpiredLinkRouteParams {
  email?: string;
  errorType?: 'expired' | 'invalid' | 'used';
}

/**
 * Expired Link Screen Component
 * Shown when a magic link is expired, invalid, or already used
 * Allows user to request a new magic link
 */
export default function ExpiredLink() {
  const navigation = useNavigation<ExpiredLinkScreenNavigationProp>();
  const route = useRoute();
  const params = (route.params || {}) as ExpiredLinkRouteParams;
  
  console.log('📧 ExpiredLink received params:', params);
  
  const [username, setUsername] = useState(params.email?.split('@')[0] || '');
  const [domain, setDomain] = useState(params.email?.split('@')[1] || 'sigmacomputing.com');
  const [usernameFocused, setUsernameFocused] = useState(false);
  const [domainFocused, setDomainFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Update email fields when route params change
  useEffect(() => {
    console.log('🔄 ExpiredLink useEffect triggered, params:', params, 'params.email:', params.email);
    if (params.email) {
      const emailParts = params.email.split('@');
      if (emailParts.length === 2) {
        console.log('✅ Setting email fields:', emailParts[0], emailParts[1]);
        setUsername(emailParts[0]);
        setDomain(emailParts[1]);
      }
    } else {
      console.log('⚠️ No email in params, checking route.params directly');
      // Also check route.params directly in case params object isn't reactive
      const directParams = route.params as ExpiredLinkRouteParams | undefined;
      if (directParams?.email) {
        console.log('✅ Found email in direct route.params:', directParams.email);
        const emailParts = directParams.email.split('@');
        if (emailParts.length === 2) {
          setUsername(emailParts[0]);
          setDomain(emailParts[1]);
        }
      }
    }
  }, [params.email, route.params]);

  const isValidEmail = (email: string) => {
    return email.includes('@') && email.length > 3 && email.split('@').length === 2;
  };

  const getCompleteEmail = (): string => {
    const user = username.trim().toLowerCase();
    const dom = domain.trim().toLowerCase();
    if (!user || !dom) {
      return '';
    }
    return `${user}@${dom}`;
  };

  const handleRequestNewLink = async () => {
    const completeEmail = getCompleteEmail();
    
    if (!isValidEmail(completeEmail)) {
      setError('Please enter a valid email address');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      await AuthService.requestMagicLink(completeEmail);
      setSuccess(true);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send magic link. Please try again.';
      setError(errorMessage);
      console.error('Magic link request error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleGoToLogin = () => {
    navigation.replace('Login');
  };

  const getErrorMessage = () => {
    switch (params.errorType) {
      case 'expired':
        return 'This magic link has expired. Magic links are valid for 15 minutes.';
      case 'used':
        return 'This magic link has already been used. Each link can only be used once.';
      case 'invalid':
      default:
        return 'This magic link is invalid or has expired.';
    }
  };

  const completeEmail = getCompleteEmail();
  const isFocused = usernameFocused || domainFocused;
  const canSubmit = isValidEmail(completeEmail);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoid}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            {/* Header Section */}
            <View style={styles.header}>
              <View style={styles.iconContainer}>
                <Ionicons name="time-outline" size={64} color={colors.warning} />
              </View>
              <Text style={styles.title}>Link Expired</Text>
              <Text style={styles.message}>{getErrorMessage()}</Text>
            </View>

            {/* Request New Link Form */}
            <View style={styles.formContainer}>
              {/* Error Message */}
              {error && (
                <View style={styles.errorContainer}>
                  <Ionicons name="alert-circle" size={20} color={colors.error} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              {/* Success Message */}
              {success && (
                <View style={styles.successContainer}>
                  <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                  <Text style={styles.successText}>
                    New magic link sent! Check your email and tap the link to sign in.
                  </Text>
                </View>
              )}

              {/* Email Input */}
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Email Address</Text>
                <View style={[
                  styles.inputRow,
                  isFocused && styles.inputRowFocused
                ]}>
                  {/* Username Input (30%) */}
                  <View style={styles.usernameWrapper}>
                    <TextInput
                      style={styles.usernameInput}
                      placeholder="username"
                      placeholderTextColor={colors.textSecondary}
                      value={username}
                      onChangeText={setUsername}
                      onFocus={() => setUsernameFocused(true)}
                      onBlur={() => setUsernameFocused(false)}
                      keyboardType="default"
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="off"
                      textAlignVertical="center"
                    />
                  </View>
                  
                  {/* @ Symbol */}
                  <Text style={styles.atSymbol}>@</Text>
                  
                  {/* Domain Input (remaining) */}
                  <View style={styles.domainWrapper}>
                    <TextInput
                      style={styles.domainInput}
                      placeholder="domain.com"
                      placeholderTextColor={colors.textSecondary}
                      value={domain}
                      onChangeText={setDomain}
                      onFocus={() => setDomainFocused(true)}
                      onBlur={() => setDomainFocused(false)}
                      keyboardType="default"
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="off"
                      textAlignVertical="center"
                    />
                  </View>
                </View>
              </View>

              {/* Submit Button */}
              <TouchableOpacity
                style={[
                  styles.submitButton,
                  (!canSubmit || loading) && styles.submitButtonDisabled
                ]}
                onPress={handleRequestNewLink}
                disabled={!canSubmit || loading}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator color={colors.textPrimary} size="large" />
                ) : (
                  <>
                    <Text style={styles.submitButtonText}>Send New Magic Link</Text>
                    <Ionicons name="mail-outline" size={20} color="#FFFFFF" />
                  </>
                )}
              </TouchableOpacity>

              {/* Info Text */}
              <Text style={styles.infoText}>
                We'll send you a new secure magic link to sign in
              </Text>
            </View>

            {/* Spacer */}
            <View style={styles.spacer} />

            {/* Back to Login Button */}
            <TouchableOpacity
              style={styles.backButton}
              onPress={handleGoToLogin}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-back" size={18} color={colors.textSecondary} />
              <Text style={styles.backButtonText}>Back to Login</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  header: {
    alignItems: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 24,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    ...shadows.medium,
  },
  title: {
    ...typography.h1,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  message: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 300,
    lineHeight: 24,
    marginBottom: spacing.md,
  },
  formContainer: {
    marginTop: spacing.md,
  },
  inputContainer: {
    marginBottom: spacing.lg,
  },
  inputLabel: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    minHeight: 56,
  },
  inputRowFocused: {
    borderColor: colors.primary,
    ...shadows.small,
  },
  usernameWrapper: {
    width: '30%',
    backgroundColor: 'transparent',
  },
  usernameInput: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    color: colors.textPrimary,
    paddingHorizontal: spacing.sm,
    paddingRight: spacing.xs,
    paddingTop: 0,
    paddingBottom: 0,
    height: 56,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  atSymbol: {
    ...typography.body,
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
    width: 20,
    textAlign: 'center',
    paddingHorizontal: 0,
    marginHorizontal: 0,
    lineHeight: 24,
  },
  domainWrapper: {
    flex: 1,
    backgroundColor: 'transparent',
    minWidth: 0,
  },
  domainInput: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    color: colors.textPrimary,
    paddingHorizontal: spacing.sm,
    paddingLeft: spacing.xs,
    paddingTop: 0,
    paddingBottom: 0,
    height: 56,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  submitButton: {
    flexDirection: 'row',
    backgroundColor: colors.primary,
    paddingVertical: spacing.md + 4,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
    minHeight: 56,
    ...shadows.medium,
  },
  submitButtonDisabled: {
    backgroundColor: colors.border,
    opacity: 0.6,
  },
  submitButtonText: {
    ...typography.body,
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginRight: spacing.sm,
  },
  infoText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
    lineHeight: 20,
  },
  spacer: {
    flex: 1,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  backButtonText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginLeft: spacing.xs,
    fontWeight: '500',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  errorText: {
    ...typography.bodySmall,
    color: colors.error,
    marginLeft: spacing.sm,
    flex: 1,
  },
  successContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  successText: {
    ...typography.bodySmall,
    color: colors.success,
    marginLeft: spacing.sm,
    flex: 1,
  },
});

