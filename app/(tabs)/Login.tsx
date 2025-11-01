import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TextInput, 
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { Config } from '../../constants/Config';
import { colors, spacing, borderRadius, typography, shadows } from '../../constants/Theme';
import type { RootStackParamList } from '../_layout';

type LoginScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Login'>;

/**
 * Login Screen Component
 * Branded authentication page with email input and dev bypass
 */
export default function Login() {
  const navigation = useNavigation<LoginScreenNavigationProp>();
  const [email, setEmail] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  const isValidEmail = (email: string) => {
    return email.includes('@') && email.length > 3;
  };

  const handleLogin = () => {
    // TODO: Implement actual authentication flow
    // For now, just navigate to Home
    navigation.replace('Home');
  };

  const handleSkip = () => {
    // Bypass authentication for development
    navigation.replace('Home');
  };

  const canSubmit = isValidEmail(email);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoid}
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
            <Text style={styles.subtitle}>
              Sign in to access your dashboards and analytics
            </Text>
          </View>

          {/* Login Form */}
          <View style={styles.formContainer}>
            {/* Email Input */}
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Email Address</Text>
              <View style={[
                styles.inputWrapper,
                isFocused && styles.inputWrapperFocused
              ]}>
                <Ionicons 
                  name="mail-outline" 
                  size={20} 
                  color={isFocused ? colors.primary : colors.textSecondary}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="you@company.com"
                  placeholderTextColor={colors.textSecondary}
                  value={email}
                  onChangeText={setEmail}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                />
              </View>
            </View>

            {/* Submit Button */}
            <TouchableOpacity
              style={[
                styles.submitButton,
                !canSubmit && styles.submitButtonDisabled
              ]}
              onPress={handleLogin}
              disabled={!canSubmit}
              activeOpacity={0.8}
            >
              <Text style={styles.submitButtonText}>Continue</Text>
              <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
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
  content: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  header: {
    alignItems: 'center',
    marginTop: spacing.xxl,
    marginBottom: spacing.xl,
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
  },
  formContainer: {
    marginTop: spacing.xl,
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
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    minHeight: 56,
  },
  inputWrapperFocused: {
    borderColor: colors.primary,
    ...shadows.small,
  },
  inputIcon: {
    marginRight: spacing.sm,
  },
  input: {
    flex: 1,
    ...typography.body,
    color: colors.textPrimary,
    paddingVertical: spacing.md,
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
});

