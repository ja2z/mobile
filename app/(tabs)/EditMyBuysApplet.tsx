import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { StackNavigationProp, RouteProp } from '@react-navigation/stack';
import { MyBuysService } from '../../services/MyBuysService';
import { AuthService } from '../../services/AuthService';
import { colors, spacing, borderRadius, typography } from '../../constants/Theme';
import { MyBuysEmbedUrlInfoModal } from '../../components/MyBuysEmbedUrlInfoModal';
import { ClientIdInfoModal } from '../../components/ClientIdInfoModal';
import { SecretKeyInfoModal } from '../../components/SecretKeyInfoModal';
import type { RootStackParamList } from '../_layout';
import type { Applet } from '../../types/mybuys.types';

type EditMyBuysAppletScreenNavigationProp = StackNavigationProp<RootStackParamList, 'EditMyBuysApplet'>;
type EditMyBuysAppletScreenRouteProp = RouteProp<RootStackParamList, 'EditMyBuysApplet'>;

/**
 * Edit My Buys Applet Screen Component
 * Allows editing an existing applet
 */
export default function EditMyBuysApplet() {
  const navigation = useNavigation<EditMyBuysAppletScreenNavigationProp>();
  const route = useRoute<EditMyBuysAppletScreenRouteProp>();
  const { appletId } = route.params;

  const [applet, setApplet] = useState<Applet | null>(null);
  const [name, setName] = useState('');
  const [embedUrl, setEmbedUrl] = useState('');
  const [embedClientId, setEmbedClientId] = useState('');
  const [embedSecretKey, setEmbedSecretKey] = useState('');
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  
  // Modal visibility states
  const [embedUrlModalVisible, setEmbedUrlModalVisible] = useState(false);
  const [clientIdModalVisible, setClientIdModalVisible] = useState(false);
  const [secretKeyModalVisible, setSecretKeyModalVisible] = useState(false);

  // Refs for field navigation
  const embedUrlInputRef = useRef<TextInput>(null);
  const embedClientIdInputRef = useRef<TextInput>(null);
  const embedSecretKeyInputRef = useRef<TextInput>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
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

  /**
   * Load applet data
   */
  useEffect(() => {
    const loadApplet = async () => {
      try {
        setLoading(true);
        const applets = await MyBuysService.listApplets();
        const found = applets.find(a => a.appletId === appletId);
        if (found) {
          setApplet(found);
          setName(found.name);
          setEmbedUrl(found.embedUrl);
          
          // Load client ID and secret from secrets table if secretName exists
          if (found.secretName) {
            try {
              const secretData = await MyBuysService.getSecretByName(found.secretName);
              if (secretData) {
                setEmbedClientId(secretData.clientId);
                setEmbedSecretKey(secretData.secretKey);
              }
            } catch (error) {
              console.log('Could not load secret for applet:', error);
              // Continue without auto-populating - user can enter manually
            }
          }
        } else {
          Alert.alert('Error', 'Applet not found', [
            { text: 'OK', onPress: () => navigation.goBack() },
          ]);
        }
      } catch (error: any) {
        console.error('Error loading applet:', error);
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
          Alert.alert('Error', error.message || 'Failed to load applet', [
            { text: 'OK', onPress: () => navigation.goBack() },
          ]);
        }
      } finally {
        setLoading(false);
      }
    };

    loadApplet();
  }, [appletId, navigation]);

  /**
   * Handle embed URL change and auto-populate client ID/secret if found
   */
  useEffect(() => {
    const autoPopulateCredentials = async () => {
      if (!embedUrl.trim()) {
        return;
      }

      // Extract secret name from URL
      const secretName = MyBuysService.extractSecretNameFromUrl(embedUrl);
      if (!secretName) {
        return;
      }

      // Try to get secret from API
      try {
        const secretData = await MyBuysService.getSecretByName(secretName);
        if (secretData) {
          // Auto-populate fields if they're empty
          if (!embedClientId.trim()) {
            setEmbedClientId(secretData.clientId);
          }
          if (!embedSecretKey.trim()) {
            setEmbedSecretKey(secretData.secretKey);
          }
        }
      } catch (error) {
        // Silently fail - user can still manually enter credentials
        console.log('Could not auto-populate credentials:', error);
      }
    };

    // Debounce the auto-population to avoid too many API calls
    const timeoutId = setTimeout(() => {
      autoPopulateCredentials();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [embedUrl]);

  /**
   * Check if all required fields are filled
   */
  const isFormValid = name.trim() && embedUrl.trim() && embedClientId.trim() && embedSecretKey.trim();

  /**
   * Handle test button press
   */
  const handleTest = async () => {
    if (!isFormValid) {
      Alert.alert('Error', 'Please fill in all fields before testing');
      return;
    }

    try {
      setTesting(true);
      setTestResult(null);

      // Test the configuration
      const result = await MyBuysService.testConfiguration({
        embedUrl,
        embedClientId,
        embedSecretKey,
      });

      if (result.success) {
        setTestResult({ success: true, message: `Test successful! (HTTP ${result.statusCode})` });
      } else {
        setTestResult({ success: false, message: result.message });
      }
    } catch (error: any) {
      console.error('Error testing configuration:', error);
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
        setTestResult({ success: false, message: error.message || 'Test failed. Please check your configuration.' });
      }
    } finally {
      setTesting(false);
    }
  };

  /**
   * Handle save button press
   */
  const handleSave = async () => {
    if (!isFormValid) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    // If test hasn't been run or failed, warn user
    if (!testResult || !testResult.success) {
      Alert.alert(
        'Test Recommended',
        'You haven\'t tested this configuration yet. Do you want to save anyway?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Save Anyway',
            onPress: async () => {
              await performSave();
            },
          },
        ]
      );
      return;
    }

    await performSave();
  };

  /**
   * Perform the actual save operation
   */
  const performSave = async () => {
    try {
      setSaving(true);

      await MyBuysService.updateApplet(appletId, {
        name,
        embedUrl,
        embedClientId,
        embedSecretKey,
      });

      // Navigate back on success (no success message needed)
      navigation.goBack();
    } catch (error: any) {
      console.error('Error updating applet:', error);
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
        Alert.alert('Error', error.message || 'Failed to update applet. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  /**
   * Handle delete button press
   */
  const handleDelete = () => {
    Alert.alert(
      'Delete Applet',
      'Are you sure? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await MyBuysService.deleteApplet(appletId);
              // Navigate back on success (no success message needed)
              navigation.goBack();
            } catch (error: any) {
              console.error('Error deleting applet:', error);
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
                Alert.alert('Error', error.message || 'Failed to delete applet. Please try again.');
              }
            }
          },
        },
      ]
    );
  };

  /**
   * Scroll to input field when it receives focus
   * For the last field (secret key), scroll to end to ensure it's visible above keyboard
   */
  const scrollToInput = (isLastField: boolean = false) => {
    setTimeout(() => {
      if (isLastField && scrollViewRef.current) {
        // For the last field, scroll to end to ensure it's visible above keyboard
        scrollViewRef.current.scrollToEnd({ animated: true });
      }
    }, 300); // Delay to allow keyboard to appear first
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading applet...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
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
        >
        {/* Name Field */}
        <View style={styles.fieldContainer}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>Name</Text>
            <Text style={styles.charCount}>{name.length}/35</Text>
          </View>
          <TextInput
            style={styles.input}
            placeholder="e.g. Demand Planning"
            placeholderTextColor={colors.textSecondary}
            value={name}
            onChangeText={setName}
            maxLength={35}
            autoCapitalize="words"
            returnKeyType="next"
            onSubmitEditing={() => embedUrlInputRef.current?.focus()}
          />
        </View>

        {/* Embed URL Field */}
        <View style={styles.fieldContainer}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>Embed URL</Text>
            <TouchableOpacity
              onPress={() => setEmbedUrlModalVisible(true)}
              style={styles.infoButton}
              activeOpacity={0.7}
            >
              <Ionicons name="information-circle-outline" size={20} color={colors.info} />
            </TouchableOpacity>
          </View>
          <TextInput
            ref={embedUrlInputRef}
            style={[styles.input, styles.urlInput]}
            placeholder="https://app.sigmacomputing.com/..."
            placeholderTextColor={colors.textSecondary}
            value={embedUrl}
            onChangeText={setEmbedUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="next"
            onSubmitEditing={() => embedClientIdInputRef.current?.focus()}
            blurOnSubmit={true}
          />
        </View>

        {/* Embed Client ID Field */}
        <View style={styles.fieldContainer}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>Embed Client ID</Text>
            <TouchableOpacity
              onPress={() => setClientIdModalVisible(true)}
              style={styles.infoButton}
              activeOpacity={0.7}
            >
              <Ionicons name="information-circle-outline" size={20} color={colors.info} />
            </TouchableOpacity>
          </View>
          <TextInput
            ref={embedClientIdInputRef}
            style={styles.input}
            placeholder="Enter your embed client ID"
            placeholderTextColor={colors.textSecondary}
            value={embedClientId}
            onChangeText={setEmbedClientId}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
            onSubmitEditing={() => {
              embedSecretKeyInputRef.current?.focus();
              scrollToInput(true);
            }}
          />
        </View>

        {/* Embed Secret Key Field */}
        <View style={styles.fieldContainer}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>Embed Secret Key</Text>
            <TouchableOpacity
              onPress={() => setSecretKeyModalVisible(true)}
              style={styles.infoButton}
              activeOpacity={0.7}
            >
              <Ionicons name="information-circle-outline" size={20} color={colors.info} />
            </TouchableOpacity>
          </View>
          <View style={styles.secretInputContainer}>
            <TextInput
              ref={embedSecretKeyInputRef}
              style={[styles.input, styles.secretInput]}
              placeholder="Enter your embed secret key"
              placeholderTextColor={colors.textSecondary}
              value={embedSecretKey}
              onChangeText={setEmbedSecretKey}
              secureTextEntry={!showSecretKey}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              blurOnSubmit={true}
              onFocus={() => scrollToInput(true)}
            />
            <TouchableOpacity
              onPress={() => setShowSecretKey(!showSecretKey)}
              style={styles.eyeButton}
              activeOpacity={0.7}
            >
              <Ionicons
                name={showSecretKey ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Test Result */}
        {testResult && (
          <View style={[styles.testResultContainer, testResult.success ? styles.testResultSuccess : styles.testResultError]}>
            <Ionicons
              name={testResult.success ? 'checkmark-circle' : 'close-circle'}
              size={20}
              color={testResult.success ? colors.success : colors.error}
            />
            <Text style={[styles.testResultText, testResult.success ? styles.testResultTextSuccess : styles.testResultTextError]}>
              {testResult.message}
            </Text>
          </View>
        )}

        {/* Buttons */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.testButton, (!isFormValid || testing) && styles.buttonDisabled]}
            onPress={handleTest}
            disabled={!isFormValid || testing}
            activeOpacity={0.7}
          >
            {testing ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={20} color={colors.primary} />
                <Text style={styles.testButtonText}>Test</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.saveButton, (!isFormValid || saving) && styles.buttonDisabled]}
            onPress={handleSave}
            disabled={!isFormValid || saving}
            activeOpacity={0.7}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="save-outline" size={20} color="#FFFFFF" />
                <Text style={styles.saveButtonText}>Save</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Delete Button */}
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={handleDelete}
          activeOpacity={0.7}
        >
          <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
          <Text style={styles.deleteButtonText}>Delete</Text>
        </TouchableOpacity>
      </ScrollView>
      </KeyboardAvoidingView>

      {/* Info Modals */}
      <MyBuysEmbedUrlInfoModal
        visible={embedUrlModalVisible}
        onClose={() => setEmbedUrlModalVisible(false)}
      />
      <ClientIdInfoModal
        visible={clientIdModalVisible}
        onClose={() => setClientIdModalVisible(false)}
      />
      <SecretKeyInfoModal
        visible={secretKeyModalVisible}
        onClose={() => setSecretKeyModalVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl, // Extra padding at bottom to ensure last field is scrollable above keyboard
  },
  fieldContainer: {
    marginBottom: spacing.lg,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  label: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
    marginRight: spacing.sm,
  },
  infoButton: {
    padding: spacing.xs,
  },
  input: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingTop: 0,
    paddingBottom: 0,
    height: 50,
    color: colors.textPrimary,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  urlInput: {
    height: 50,
  },
  secretInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  secretInput: {
    flex: 1,
    marginRight: spacing.sm,
  },
  eyeButton: {
    padding: spacing.sm,
  },
  charCount: {
    ...typography.caption,
    color: colors.textSecondary,
    marginLeft: 'auto',
  },
  testResultContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.lg,
  },
  testResultSuccess: {
    backgroundColor: '#D1FAE5',
  },
  testResultError: {
    backgroundColor: '#FEE2E2',
  },
  testResultText: {
    ...typography.bodySmall,
    marginLeft: spacing.sm,
    flex: 1,
  },
  testResultTextSuccess: {
    color: colors.success,
  },
  testResultTextError: {
    color: colors.error,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  testButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background,
    borderWidth: 2,
    borderColor: colors.primary,
    gap: spacing.sm,
  },
  testButtonText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.primary,
  },
  saveButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    gap: spacing.sm,
  },
  saveButtonText: {
    ...typography.body,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    backgroundColor: colors.error,
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  deleteButtonText: {
    ...typography.body,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  headerButton: {
    padding: spacing.sm,
    marginLeft: spacing.sm,
  },
});

