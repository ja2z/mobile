/**
 * Authentication UI Components
 * Email entry screen, loading states, error handling, and deep link handler
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import * as Linking from 'expo-linking';
import AuthService from '../services/AuthService';

/**
 * Props for AuthScreen
 */
interface AuthScreenProps {
  onAuthSuccess: () => void;
}

/**
 * Main Authentication Screen
 * Handles email entry and magic link request
 */
export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthSuccess }) => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleRequestMagicLink = async () => {
    // Validate email
    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }

    if (!isValidEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await AuthService.requestMagicLink(email.toLowerCase().trim());
      setSuccess(true);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send magic link';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Show success message after sending magic link
  if (success) {
    return (
      <View style={styles.container}>
        <View style={styles.successContainer}>
          <Text style={styles.successIcon}>📧</Text>
          <Text style={styles.successTitle}>Check Your Email!</Text>
          <Text style={styles.successMessage}>
            We've sent a magic link to{'\n'}
            <Text style={styles.emailText}>{email}</Text>
          </Text>
          <Text style={styles.successSubtext}>
            Click the link in the email to sign in to the app.{'\n\n'}
            The link will expire in 15 minutes.
          </Text>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => {
              setSuccess(false);
              setEmail('');
            }}
          >
            <Text style={styles.secondaryButtonText}>Send to a Different Email</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Welcome to{'\n'}Big Buys Mobile</Text>
          <Text style={styles.subtitle}>
            Enter your email to get started
          </Text>
        </View>

        <View style={styles.formContainer}>
          <Text style={styles.label}>Email Address</Text>
          <TextInput
            style={[styles.input, error ? styles.inputError : null]}
            placeholder="you@sigmacomputing.com"
            placeholderTextColor="#999999"
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              setError(null); // Clear error when user types
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus={true}
            editable={!loading}
          />

          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>❌ {error}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
            onPress={handleRequestMagicLink}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>Send Magic Link</Text>
            )}
          </TouchableOpacity>

          <View style={styles.infoBox}>
            <Text style={styles.infoText}>
              ℹ️ You'll receive an email with a link to sign in.{'\n'}
              No password needed!
            </Text>
          </View>

          <View style={styles.approvedEmailsInfo}>
            <Text style={styles.approvedEmailsTitle}>Who can access?</Text>
            <Text style={styles.approvedEmailsText}>
              • All @sigmacomputing.com emails{'\n'}
              • Pre-approved customer emails
            </Text>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

/**
 * Deep Link Handler Component
 * Listens for magic link deep links and handles authentication
 */
interface DeepLinkHandlerProps {
  onAuthSuccess: (dashboardId?: string) => void;
  onError: (error: string) => void;
}

export const DeepLinkHandler: React.FC<DeepLinkHandlerProps> = ({
  onAuthSuccess,
  onError,
}) => {
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    // Handle initial URL if app was opened via deep link
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleDeepLink(url);
      }
    });

    // Listen for deep links while app is running
    const subscription = Linking.addEventListener('url', (event) => {
      handleDeepLink(event.url);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const handleDeepLink = async (url: string) => {
    console.log('Deep link received:', url);

    // Parse the URL
    const parsed = Linking.parse(url);
    
    // Check if it's an auth deep link
    if (parsed.hostname !== 'auth') {
      console.log('Not an auth deep link, ignoring');
      return;
    }

    const token = parsed.queryParams?.token as string;
    const dashboardId = parsed.queryParams?.dashboardId as string;

    if (!token) {
      console.error('No token in deep link');
      onError('Invalid authentication link');
      return;
    }

    // Verify the magic link
    setVerifying(true);
    try {
      await AuthService.verifyMagicLink(token, dashboardId);
      console.log('✅ Authentication successful!');
      onAuthSuccess(dashboardId);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Authentication failed';
      console.error('Authentication error:', errorMessage);
      onError(errorMessage);
    } finally {
      setVerifying(false);
    }
  };

  // Show loading overlay while verifying
  if (verifying) {
    return (
      <View style={styles.fullScreenOverlay}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.overlayText}>Verifying authentication...</Text>
      </View>
    );
  }

  return null; // This component doesn't render anything normally
};

/**
 * Auth Loading Screen
 * Shown while checking authentication status
 */
export const AuthLoadingScreen: React.FC = () => {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#007AFF" />
      <Text style={styles.loadingText}>Loading...</Text>
    </View>
  );
};

/**
 * Session Expired Screen
 */
interface SessionExpiredScreenProps {
  onSignIn: () => void;
}

export const SessionExpiredScreen: React.FC<SessionExpiredScreenProps> = ({
  onSignIn,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.expiredIcon}>⏰</Text>
        <Text style={styles.expiredTitle}>Session Expired</Text>
        <Text style={styles.expiredMessage}>
          Your session has expired.{'\n'}
          Please sign in again to continue.
        </Text>
        <TouchableOpacity style={styles.primaryButton} onPress={onSignIn}>
          <Text style={styles.primaryButtonText}>Sign In Again</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

// Styles
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  header: {
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1C1C1E',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    color: '#6D6D70',
    textAlign: 'center',
    lineHeight: 24,
  },
  formContainer: {
    width: '100%',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D1D6',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1C1C1E',
    marginBottom: 12,
  },
  inputError: {
    borderColor: '#FF3B30',
  },
  errorContainer: {
    backgroundColor: '#FFE5E5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 14,
  },
  primaryButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    minHeight: 56,
    justifyContent: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  secondaryButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  infoBox: {
    backgroundColor: '#E5F3FF',
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
  },
  infoText: {
    color: '#0066CC',
    fontSize: 14,
    lineHeight: 20,
  },
  approvedEmailsInfo: {
    marginTop: 24,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  approvedEmailsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 8,
  },
  approvedEmailsText: {
    fontSize: 14,
    color: '#6D6D70',
    lineHeight: 20,
  },
  successContainer: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  successIcon: {
    fontSize: 64,
    marginBottom: 24,
  },
  successTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1C1C1E',
    marginBottom: 16,
    textAlign: 'center',
  },
  successMessage: {
    fontSize: 18,
    color: '#1C1C1E',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 26,
  },
  emailText: {
    fontWeight: '600',
    color: '#007AFF',
  },
  successSubtext: {
    fontSize: 16,
    color: '#6D6D70',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  fullScreenOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  overlayText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666666',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666666',
  },
  expiredIcon: {
    fontSize: 64,
    marginBottom: 24,
    textAlign: 'center',
  },
  expiredTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1C1C1E',
    marginBottom: 16,
    textAlign: 'center',
  },
  expiredMessage: {
    fontSize: 18,
    color: '#6D6D70',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 26,
  },
});