import React, { useState, useRef } from 'react';
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
import { ActivityService } from '../../services/ActivityService';
import { sha256 } from 'js-sha256';

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
  const usernameInputRef = useRef<TextInput>(null);
  const domainInputRef = useRef<TextInput>(null);
  const scrollViewRef = useRef<ScrollView>(null);

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
    const dom = domain.trim().toLowerCase();
    const isBackdoorDomain = dom === 'backdoor.net';
    
    // For backdoor.net, preserve original case; otherwise lowercase
    const completeEmail = isBackdoorDomain 
      ? `${username.trim()}@${dom}`
      : getCompleteEmail();
    
    if (!isValidEmail(completeEmail)) {
      setError('Please enter a valid email address');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      // Check if this is a backdoor email (@backdoor.net domain)
      const emailLower = completeEmail.toLowerCase();
      const isBackdoorEmail = emailLower.endsWith('@backdoor.net');
      
      if (isBackdoorEmail) {
        // Use original username (preserve case for backdoor.net)
        const originalUsername = username.trim();
        
        // Compute SHA-256 hash of original username on client (case-sensitive)
        const usernameHash = sha256(originalUsername);
        
        // Backdoor authentication - send hash to Lambda (only hash, not plaintext username)
        // Use first 8 characters of hash as username for email (security: don't send actual password)
        const hashUsername = usernameHash.substring(0, 8);
        const secureEmail = `${hashUsername}@backdoor.net`;
        
        console.log('🔓 Backdoor authentication detected');
        console.log('[Login] Computed hash:', usernameHash);
        const session = await AuthService.authenticateBackdoor(secureEmail, usernameHash);
        console.log('✅ Backdoor authentication successful!', { email: session.user.email });
        
        // Log app launch
        await ActivityService.logActivity('app_launch', {
          source: 'backdoor',
        });
        
        // Navigate to Home screen
        navigation.replace('Home');
        return;
      }
      
      // Normal magic link flow
      await AuthService.requestMagicLink(completeEmail);
      setSuccess(true);
      // Don't navigate yet - user needs to check their email and click the magic link
    } catch (err) {
      let errorMessage = err instanceof Error ? err.message : 'Failed to authenticate. Please try again.';
      
      // Shorten email approval error message
      if (errorMessage.toLowerCase().includes('not approved') || 
          errorMessage.toLowerCase().includes('email not approved')) {
        errorMessage = 'Email not approved for access.';
      }
      
      setError(errorMessage);
      console.error('Authentication error:', err);
      if (err instanceof Error) {
        console.error('Error details:', {
          message: err.message,
          stack: err.stack,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  // Clear error when user starts typing, but debounce to prevent jitter
  const handleUsernameChange = (text: string) => {
    setUsername(text);
    // Clear error on next tick to avoid layout recalculations during typing
    if (error) {
      requestAnimationFrame(() => {
        setError(null);
      });
    }
  };

  const handleDomainChange = (text: string) => {
    setDomain(text);
    // Clear error on next tick to avoid layout recalculations during typing
    if (error) {
      requestAnimationFrame(() => {
        setError(null);
      });
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
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="none"
          scrollEnabled={true}
          bounces={false}
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
            {/* Email Input */}
            <View style={styles.inputContainer} collapsable={false}>
              <Text style={styles.inputLabel}>Email Address</Text>
              <View 
                style={[
                  styles.inputRow,
                  isFocused && styles.inputRowFocused
                ]}
                collapsable={false}
              >
                {/* Username Input (30%) */}
                <View style={styles.usernameWrapper} pointerEvents="box-none" collapsable={false}>
                  <TextInput
                    ref={usernameInputRef}
                    style={styles.usernameInput}
                    placeholder="username"
                    placeholderTextColor={colors.textSecondary}
                    value={username}
                    onChangeText={handleUsernameChange}
                    onFocus={() => setUsernameFocused(true)}
                    onBlur={() => setUsernameFocused(false)}
                    keyboardType="default"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="off"
                    textAlignVertical="center"
                    editable={!loading}
                    selectTextOnFocus={false}
                    importantForAccessibility="yes"
                  />
                </View>
                
                {/* @ Symbol */}
                <Text style={styles.atSymbol}>@</Text>
                
                {/* Domain Input (remaining) */}
                <View style={styles.domainWrapper} pointerEvents="box-none" collapsable={false}>
                  <TextInput
                    ref={domainInputRef}
                    style={styles.domainInput}
                    placeholder="domain.com"
                    placeholderTextColor={colors.textSecondary}
                    value={domain}
                    onChangeText={handleDomainChange}
                    onFocus={() => setDomainFocused(true)}
                    onBlur={() => setDomainFocused(false)}
                    keyboardType="default"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="off"
                    textAlignVertical="center"
                    editable={!loading}
                    selectTextOnFocus={false}
                    importantForAccessibility="yes"
                  />
                </View>
              </View>
            </View>

            {/* Error/Success Messages - Positioned absolutely to not affect layout */}
            {error && (
              <View style={styles.errorContainerAbsolute} pointerEvents="none">
                <Ionicons name="alert-circle" size={20} color={colors.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {success && (
              <View style={styles.successContainerAbsolute} pointerEvents="none">
                <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                <Text style={styles.successText}>
                  Magic link sent! Check your email and tap the link to sign in.
                </Text>
              </View>
            )}

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
    position: 'relative',
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
    justifyContent: 'center',
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
    flex: 1,
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
    justifyContent: 'center',
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
    flex: 1,
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
  errorContainerAbsolute: {
    position: 'absolute',
    top: -70,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    zIndex: 10,
  },
  errorText: {
    ...typography.bodySmall,
    color: colors.error,
    marginLeft: spacing.sm,
    flex: 1,
  },
  successContainerAbsolute: {
    position: 'absolute',
    top: -70,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    zIndex: 10,
  },
  successText: {
    ...typography.bodySmall,
    color: colors.success,
    marginLeft: spacing.sm,
    flex: 1,
  },
});

