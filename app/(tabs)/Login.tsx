import React, { useState, useRef, useEffect } from 'react';
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
  Animated,
  LayoutChangeEvent,
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
import { BackdoorPasswordModal } from '../../components/BackdoorPasswordModal';
import { setLoginLogoTarget, loginLogoOpacity } from '../../constants/LoginLogoTransition';

type LoginScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Login'>;

const DEFAULT_DOMAIN = 'sigmacomputing.com';

/**
 * Login Screen Component
 * Branded authentication page with email input and dev bypass
 */
export default function Login() {
  const navigation = useNavigation<LoginScreenNavigationProp>();
  const [username, setUsername] = useState('');
  const [domain, setDomain] = useState(DEFAULT_DOMAIN);
  const [usernameFocused, setUsernameFocused] = useState(false);
  const [domainFocused, setDomainFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [storedUsernameHash, setStoredUsernameHash] = useState<string | null>(null);
  const [storedSecureEmail, setStoredSecureEmail] = useState<string | null>(null);
  const [domainTextWidth, setDomainTextWidth] = useState(0);
  const usernameInputRef = useRef<TextInput>(null);
  const domainInputRef = useRef<TextInput>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const logoContainerRef = useRef<View>(null);
  const errorOpacity = useRef(new Animated.Value(0)).current;
  const errorDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Publish the logo's window-space center + size so the splash-exit animation
   * can scale/translate its overlay logo to land exactly on top of this one.
   * onLayout fires before iOS finishes compositing on some devices; one RAF
   * guarantees measureInWindow returns stable coordinates.
   */
  const handleLogoLayout = () => {
    requestAnimationFrame(() => {
      logoContainerRef.current?.measureInWindow((x, y, w, h) => {
        if (w > 0 && h > 0) {
          setLoginLogoTarget({
            centerX: x + w / 2,
            centerY: y + h / 2,
            size: w,
          });
        }
      });
    });
  };

  useEffect(() => {
    return () => {
      setLoginLogoTarget(null);
    };
  }, []);

  /**
   * Fade the error banner out, then clear the error state. Also clears any
   * pending auto-dismiss timer so it can't fire on top of a manual dismiss.
   */
  const dismissError = () => {
    if (errorDismissTimerRef.current) {
      clearTimeout(errorDismissTimerRef.current);
      errorDismissTimerRef.current = null;
    }
    Animated.timing(errorOpacity, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setError(null);
      }
    });
  };

  /**
   * Whenever a new error appears, fade the banner in and schedule an
   * auto-dismiss ~3s later. Clearing the error from elsewhere (typing,
   * focusing an input, a successful submit) goes through dismissError().
   */
  useEffect(() => {
    if (error) {
      Animated.timing(errorOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();

      if (errorDismissTimerRef.current) {
        clearTimeout(errorDismissTimerRef.current);
      }
      errorDismissTimerRef.current = setTimeout(() => {
        dismissError();
      }, 3000);
    }

    return () => {
      if (errorDismissTimerRef.current) {
        clearTimeout(errorDismissTimerRef.current);
        errorDismissTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

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
      if (!username.trim()) {
        setError('Please enter your email first.');
      } else if (!domain.trim()) {
        setError('Please enter a domain.');
      } else {
        setError('Please enter a valid email address.');
      }
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const emailLower = completeEmail.toLowerCase();
      const isSigmaEmail = emailLower.endsWith('@sigmacomputing.com');
      
      // For @sigmacomputing.com emails, compute username hash to check for backdoor user
      let usernameHash: string | undefined = undefined;
      if (isSigmaEmail) {
        const originalUsername = username.trim();
        usernameHash = sha256(originalUsername);
        console.log('[Login] Computed username hash for sigma email:', usernameHash.substring(0, 16) + '...');
      }
      
      // Request magic link (will return requiresBackdoorAuth if backdoor user detected)
      try {
        await AuthService.requestMagicLink(completeEmail, usernameHash);
        setSuccess(true);
        // Don't navigate yet - user needs to check their email and click the magic link
      } catch (err: any) {
        // Check if server detected backdoor user and requires backdoor auth
        if (err.requiresBackdoorAuth === true) {
          // Switch to backdoor authentication flow
          if (!usernameHash) {
            // Should not happen, but handle gracefully
            throw new Error('Backdoor authentication required but username hash not available');
          }
          
          // Use first 8 characters of hash as username for email (security: don't send actual username)
          const hashUsername = usernameHash.substring(0, 8);
          const secureEmail = `${hashUsername}@sigmacomputing.com`;
          
          console.log('🔓 Backdoor authentication detected by server');
          console.log('[Login] Switching to backdoor flow');
          
          try {
            const session = await AuthService.authenticateBackdoor(secureEmail, usernameHash);
            console.log('✅ Backdoor authentication successful!', { email: session.user.email });
            
            // Log app launch
            await ActivityService.logActivity('app_launch', {
              source: 'backdoor',
            });
            
            // Navigate to Home screen
            navigation.replace('Home');
            return;
          } catch (backdoorErr: any) {
            // Check if password is required (step 1 of two-step validation)
            if (backdoorErr.requiresPassword === true) {
              // Store the username hash and secure email for password submission
              setStoredUsernameHash(usernameHash);
              setStoredSecureEmail(secureEmail);
              setShowPasswordModal(true);
              setPasswordError(null);
              setLoading(false);
              return;
            }
            // Re-throw other errors to be handled by the outer catch block
            throw backdoorErr;
          }
        }
        // Re-throw other errors (not backdoor-related)
        throw err;
      }
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

  const handlePasswordSubmit = async (password: string) => {
    if (!storedUsernameHash || !storedSecureEmail) {
      setPasswordError('Session expired. Please try again.');
      return;
    }

    setPasswordLoading(true);
    setPasswordError(null);

    try {
      // Compute SHA-256 hash of password on client
      const passwordHash = sha256(password);
      
      console.log('🔐 Submitting password for backdoor authentication');
      const session = await AuthService.authenticateBackdoor(storedSecureEmail, storedUsernameHash, passwordHash);
      console.log('✅ Backdoor authentication with password successful!', { email: session.user.email });
      
      // Log app launch
      await ActivityService.logActivity('app_launch', {
        source: 'backdoor',
      });
      
      // Clear stored values
      setStoredUsernameHash(null);
      setStoredSecureEmail(null);
      setShowPasswordModal(false);
      
      // Navigate to Home screen
      navigation.replace('Home');
    } catch (err) {
      let errorMessage = err instanceof Error ? err.message : 'Invalid password. Please try again.';
      
      // Provide user-friendly error message
      if (errorMessage.toLowerCase().includes('invalid password') || 
          errorMessage.toLowerCase().includes('access denied')) {
        errorMessage = 'Invalid password. Please try again.';
      }
      
      setPasswordError(errorMessage);
      console.error('Password authentication error:', err);
    } finally {
      setPasswordLoading(false);
    }
  };

  const handlePasswordCancel = () => {
    setShowPasswordModal(false);
    setPasswordError(null);
    setStoredUsernameHash(null);
    setStoredSecureEmail(null);
  };

  const handleUsernameChange = (text: string) => {
    setUsername(text);
    if (error) {
      dismissError();
    }
  };

  const handleDomainChange = (text: string) => {
    setDomain(text);
    if (error) {
      dismissError();
    }
  };

  const handleDomainMeasure = (e: LayoutChangeEvent) => {
    const w = Math.ceil(e.nativeEvent.layout.width);
    if (w > 0 && w !== domainTextWidth) {
      setDomainTextWidth(w);
    }
  };

  const completeEmail = getCompleteEmail();
  const isFocused = usernameFocused || domainFocused;
  const canSubmit = isValidEmail(completeEmail);
  const isDomainDefault = domain === DEFAULT_DOMAIN;

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
          {/* Top Spacer */}
          <View style={styles.spacer} />

          {/* Header Section with Branding */}
          <View style={styles.header}>
            <View
              ref={logoContainerRef}
              style={styles.logoContainer}
              onLayout={handleLogoLayout}
              collapsable={false}
            >
              <Animated.View style={[styles.logo, { opacity: loginLogoOpacity }]}>
                <Image
                  source={require('../../assets/zeta_solid_purple_6B2A87_1024x1024_cropped_transparent.png')}
                  style={styles.logo}
                  resizeMode="contain"
                  resizeMethod="scale"
                  fadeDuration={0}
                  accessibilityIgnoresInvertColors
                  accessibilityLabel="Zeta logo"
                />
              </Animated.View>
            </View>
            <Text style={styles.appName}>{Config.APP_NAME}</Text>
          </View>

          {/* Login Form */}
          <View style={styles.formContainer}>
            {/* Email Input */}
            <View style={styles.inputContainer} collapsable={false}>
              <View 
                style={[
                  styles.inputRow,
                  isFocused && styles.inputRowFocused
                ]}
                collapsable={false}
              >
                {/* Username Input (flexes to fill leftover row width) */}
                <View style={styles.usernameWrapper} pointerEvents="box-none" collapsable={false}>
                  <TextInput
                    ref={usernameInputRef}
                    style={styles.usernameInput}
                    placeholder="username"
                    placeholderTextColor={colors.textSecondary}
                    value={username}
                    onChangeText={handleUsernameChange}
                    onFocus={() => {
                      setUsernameFocused(true);
                      if (error) dismissError();
                    }}
                    onBlur={() => setUsernameFocused(false)}
                    keyboardType="default"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="off"
                    textAlignVertical="center"
                    editable={!loading}
                    selectTextOnFocus={false}
                    accessibilityLabel="Email address, username"
                    accessibilityHint="Enter the part of your email before the at sign"
                    importantForAccessibility="yes"
                  />
                </View>
                
                {/* @ Symbol */}
                <Text style={styles.atSymbol}>@</Text>
                
                {/* Domain Input (sized to content so username can use remaining space) */}
                <View
                  style={[
                    styles.domainWrapper,
                    domainTextWidth > 0 && { width: domainTextWidth + spacing.xs + spacing.sm + 2 },
                  ]}
                  pointerEvents="box-none"
                  collapsable={false}
                >
                  <TextInput
                    ref={domainInputRef}
                    style={[
                      styles.domainInput,
                      isDomainDefault && styles.domainInputDefault,
                    ]}
                    placeholder="domain.com"
                    placeholderTextColor={colors.textSecondary}
                    value={domain}
                    onChangeText={handleDomainChange}
                    onFocus={() => {
                      setDomainFocused(true);
                      if (error) dismissError();
                    }}
                    onBlur={() => setDomainFocused(false)}
                    keyboardType="default"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="off"
                    textAlignVertical="center"
                    editable={!loading}
                    selectTextOnFocus={false}
                    accessibilityLabel="Email address, domain"
                    accessibilityHint="Enter the part of your email after the at sign. Defaults to sigmacomputing.com."
                    importantForAccessibility="yes"
                  />
                </View>

                {/* Off-screen measurer: picks up the intrinsic width of whatever
                    the domain input is displaying so the domain column can size
                    to content and the username column can claim the leftover
                    space instead of truncating with an ellipsis. */}
                <Text
                  style={styles.domainMeasure}
                  numberOfLines={1}
                  onLayout={handleDomainMeasure}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  pointerEvents="none"
                >
                  {domain.length > 0 ? domain : 'domain.com'}
                </Text>
              </View>
            </View>

            {/* Error/Success Messages - Positioned absolutely to not affect layout */}
            {error && (
              <Animated.View
                style={[styles.errorContainerAbsolute, { opacity: errorOpacity }]}
                pointerEvents="none"
              >
                <Ionicons name="alert-circle" size={20} color={colors.error} />
                <Text style={styles.errorText}>{error}</Text>
              </Animated.View>
            )}

            {success && (
              <View style={styles.successContainerAbsolute} pointerEvents="none">
                <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                <Text style={styles.successText}>
                  Magic link sent! Check your email and tap the link to sign in.
                </Text>
              </View>
            )}

            {/* Submit Button */}
            <TouchableOpacity
              style={[
                styles.submitButton,
                (!canSubmit || loading) && styles.submitButtonDisabled
              ]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.8}
              accessibilityState={{ disabled: !canSubmit || loading }}
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
          </View>

          {/* Bottom Spacer */}
          <View style={styles.spacer} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Backdoor Password Modal */}
      <BackdoorPasswordModal
        visible={showPasswordModal}
        onSubmit={handlePasswordSubmit}
        onCancel={handlePasswordCancel}
        loading={passwordLoading}
        error={passwordError}
      />
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
    paddingVertical: spacing.xl,
  },
  header: {
    alignItems: 'center',
    marginTop: 0,
    marginBottom: spacing.md,
  },
  logoContainer: {
    width: 240,
    height: 240,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  appName: {
    ...typography.h1,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  formContainer: {
    marginTop: spacing.lg,
    position: 'relative',
  },
  inputContainer: {
    marginBottom: spacing.lg,
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
    flex: 1,
    minWidth: 60,
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
    backgroundColor: 'transparent',
    minWidth: 0,
    flexShrink: 0,
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
  domainInputDefault: {
    color: colors.textSecondary,
  },
  domainMeasure: {
    position: 'absolute',
    left: -10000,
    top: 0,
    opacity: 0,
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    includeFontPadding: false,
  },
  submitButton: {
    flexDirection: 'row',
    backgroundColor: colors.accentBlue,
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
  spacer: {
    flex: 1,
  },
  errorContainerAbsolute: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: spacing.lg + spacing.md,
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
    top: '100%',
    left: 0,
    right: 0,
    marginTop: spacing.lg + spacing.md,
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

