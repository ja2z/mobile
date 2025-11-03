import React, { useState } from 'react';
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
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { Config } from '../../constants/Config';
import { colors, spacing, borderRadius, typography, shadows } from '../../constants/Theme';
import type { RootStackParamList } from '../_layout';
import { AuthService } from '../../services/AuthService';

type LoginScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Login'>;

/**
 * Login Screen Component
 * Branded authentication page with email input and dev bypass
 */
export default function Login() {
  const navigation = useNavigation<LoginScreenNavigationProp>();
  const [username, setUsername] = useState('');
  const [domain, setDomain] = useState('sigmacomputing.com');
  const [usernameFocused, setUsernameFocused] = useState(false);
  const [domainFocused, setDomainFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

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

  const handleLogin = async () => {
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
      // Don't navigate yet - user needs to check their email and click the magic link
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send magic link. Please try again.';
      setError(errorMessage);
      console.error('Magic link request error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    // Bypass authentication for development
    navigation.replace('Home');
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
          {/* Header Section with Branding */}
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <Image 
                source={require('../../assets/bigbuys.png')}
                style={styles.logo}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.appName}>{Config.APP_NAME}</Text>
            <Text style={styles.welcomeText}>Welcome</Text>
          </View>

          {/* Login Form */}
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
                  Magic link sent! Check your email and tap the link to sign in.
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
                    autoComplete="username"
                    multiline={false}
                    numberOfLines={1}
                    scrollEnabled={false}
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
                    multiline={false}
                    numberOfLines={1}
                    scrollEnabled={false}
                    textAlignVertical="center"
                  />
                </View>
              </View>
            </View>

            {/* Subtitle moved below email input */}
            <Text style={styles.subtitle}>
              Sign in to access your data
            </Text>

            {/* Submit Button */}
            <TouchableOpacity
              style={[
                styles.submitButton,
                (!canSubmit || loading) && styles.submitButtonDisabled
              ]}
              onPress={handleLogin}
              disabled={!canSubmit || loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color={colors.textPrimary} size="large" />
              ) : (
                <>
                  <Text style={styles.submitButtonText}>Continue</Text>
                  <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
                </>
              )}
            </TouchableOpacity>

            {/* Info Text */}
            <Text style={styles.infoText}>
              We'll send you a secure magic link to sign in
            </Text>
          </View>

          {/* Spacer */}
          <View style={styles.spacer} />

          {/* Dev Bypass Button */}
          <TouchableOpacity
            style={styles.skipButton}
            onPress={handleSkip}
            activeOpacity={0.7}
          >
            <Ionicons name="code-outline" size={18} color={colors.textSecondary} />
            <Text style={styles.skipButtonText}>Skip for Now (Dev Mode)</Text>
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
  logoContainer: {
    width: 120,
    height: 120,
    borderRadius: 24,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    ...shadows.medium,
  },
  logo: {
    width: 100,
    height: 100,
  },
  appName: {
    ...typography.h1,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  welcomeText: {
    ...typography.h2,
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 300,
    lineHeight: 24,
    marginTop: spacing.md,
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
    overflow: 'hidden',
    flexShrink: 1,
    height: 52,
    maxHeight: 52,
    justifyContent: 'center',
  },
  usernameInput: {
    ...typography.body,
    color: colors.textPrimary,
    padding: 0,
    paddingHorizontal: spacing.sm,
    paddingRight: spacing.xs,
    margin: 0,
    includeFontPadding: false,
    lineHeight: undefined,
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
    overflow: 'hidden',
    flexShrink: 1,
    height: 52,
    maxHeight: 52,
    justifyContent: 'center',
  },
  domainInput: {
    ...typography.body,
    color: colors.textPrimary,
    padding: 0,
    paddingHorizontal: spacing.sm,
    paddingLeft: spacing.xs,
    margin: 0,
    includeFontPadding: false,
    lineHeight: undefined,
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
  skipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  skipButtonText: {
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

