import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import * as Clipboard from 'expo-clipboard';
import { MyBuysService } from '../../services/MyBuysService';
import { SigmaRestApiService } from '../../services/SigmaRestApiService';
import { colors, spacing, borderRadius, typography } from '../../constants/Theme';
import { MyBuysEmbedUrlInfoModal } from '../../components/MyBuysEmbedUrlInfoModal';
import { ClientIdInfoModal } from '../../components/ClientIdInfoModal';
import { SecretKeyInfoModal } from '../../components/SecretKeyInfoModal';
import { RestApiInfoModal } from '../../components/RestApiInfoModal';
import { SigmaApiDetectFailedModal } from '../../components/SigmaApiDetectFailedModal';
import { SIGMA_API_SERVERS, DEFAULT_SIGMA_API_SERVER } from '../../constants/SigmaApiServers';
import { parseSigmaEmbedUrl } from '../../utils/parseSigmaEmbedUrl';
import { mergeFetchedPagesWithExisting } from '../../utils/mergeSigmaPagesWithConfig';
import type { RootStackParamList } from '../_layout';
import type { PageFooterPageConfig } from '../../types/mybuys.types';

type AddMyBuysAppletScreenNavigationProp = StackNavigationProp<RootStackParamList, 'AddMyBuysApplet'>;

type TabName = 'basic' | 'advanced';

export default function AddMyBuysApplet() {
  const navigation = useNavigation<AddMyBuysAppletScreenNavigationProp>();

  // --- Basic fields ---
  const [name, setName] = useState('');
  const [embedUrl, setEmbedUrl] = useState('');
  const [embedClientId, setEmbedClientId] = useState('');
  const [embedSecretKey, setEmbedSecretKey] = useState('');
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // --- Advanced fields ---
  const [activeTab, setActiveTab] = useState<TabName>('basic');
  const [sigmaApiBaseUrl, setSigmaApiBaseUrl] = useState(DEFAULT_SIGMA_API_SERVER);
  const [showServerPicker, setShowServerPicker] = useState(false);
  /** When false, Test only validates embed; REST API / footer UI is hidden. */
  const [useRestApiFeatures, setUseRestApiFeatures] = useState(false);
  const [sameAsEmbed, setSameAsEmbed] = useState(true);
  const [restApiClientId, setRestApiClientId] = useState('');
  const [restApiSecretKey, setRestApiSecretKey] = useState('');
  const [showRestSecret, setShowRestSecret] = useState(false);

  // --- Pages ---
  const [fetchingPages, setFetchingPages] = useState(false);
  const [pagesError, setPagesError] = useState<string | null>(null);
  const [pages, setPages] = useState<PageFooterPageConfig[]>([]);

  // --- Modals ---
  const [embedUrlModalVisible, setEmbedUrlModalVisible] = useState(false);
  const [clientIdModalVisible, setClientIdModalVisible] = useState(false);
  const [secretKeyModalVisible, setSecretKeyModalVisible] = useState(false);
  const [restApiInfoModalVisible, setRestApiInfoModalVisible] = useState(false);
  const [detectingApiServer, setDetectingApiServer] = useState(false);
  const [detectFailedModalVisible, setDetectFailedModalVisible] = useState(false);

  // --- Refs ---
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

  // --- Auto-populate credentials from existing secrets ---
  useEffect(() => {
    const autoPopulateCredentials = async () => {
      if (!embedUrl.trim()) return;
      const secretName = MyBuysService.extractSecretNameFromUrl(embedUrl);
      if (!secretName) return;

      try {
        const secretData = await MyBuysService.getSecretByName(secretName);
        if (secretData) {
          if (!embedClientId.trim()) setEmbedClientId(secretData.clientId);
          if (!embedSecretKey.trim()) setEmbedSecretKey(secretData.secretKey);
        }
        // Also try to populate REST API creds (from __sigma_rest secret)
        if (useRestApiFeatures && !sameAsEmbed) {
          const restSecret = await MyBuysService.getSecretByName(secretName + '__sigma_rest');
          if (restSecret) {
            if (!restApiClientId.trim()) setRestApiClientId(restSecret.clientId);
            if (!restApiSecretKey.trim()) setRestApiSecretKey(restSecret.secretKey);
          }
        }
      } catch {
        // Silently fail
      }
    };

    const timeoutId = setTimeout(autoPopulateCredentials, 500);
    return () => clearTimeout(timeoutId);
  }, [embedUrl, useRestApiFeatures, sameAsEmbed]);

  // --- Derived state ---
  const isFormValid = name.trim() && embedUrl.trim() && embedClientId.trim() && embedSecretKey.trim();
  const advancedTabEnabled = !!embedUrl.trim();

  const parsedEmbed = useMemo(() => parseSigmaEmbedUrl(embedUrl), [embedUrl]);
  const workbookId = parsedEmbed?.workbookId ?? null;

  const resolvedRestClientId = sameAsEmbed ? embedClientId : restApiClientId;
  const resolvedRestSecret = sameAsEmbed ? embedSecretKey : restApiSecretKey;
  const hasRestCreds =
    useRestApiFeatures && !!resolvedRestClientId.trim() && !!resolvedRestSecret.trim();
  const canGetPages = useRestApiFeatures && !!workbookId && hasRestCreds;

  // --- Handlers ---
  const handleTest = async () => {
    if (!isFormValid) {
      Alert.alert('Error', 'Please fill in all fields before testing');
      return;
    }
    try {
      setTesting(true);
      setTestResult(null);

      // 1) Embed HEAD test via Lambda
      const result = await MyBuysService.testConfiguration({
        embedUrl,
        embedClientId,
        embedSecretKey,
      });

      if (!result.success) {
        setTestResult({ success: false, message: `Embed: ${result.message}` });
        return;
      }

      // 2) Optional: REST whoami when Advanced is enabled and creds resolve
      if (useRestApiFeatures && hasRestCreds) {
        const whoami = await SigmaRestApiService.whoami(
          resolvedRestClientId,
          resolvedRestSecret,
          sigmaApiBaseUrl,
        );
        if (!whoami.success) {
          setTestResult({ success: false, message: `Embed OK, REST API: ${whoami.message}` });
          return;
        }
        setTestResult({ success: true, message: `Embed OK (HTTP ${result.statusCode}). REST API verified.` });
      } else {
        setTestResult({ success: true, message: `Test successful! (HTTP ${result.statusCode})` });
      }
    } catch (error: any) {
      if (error.isSessionExpired) {
        navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
      } else if (error.isExpirationError) {
        Alert.alert('Account Expired', error.message || 'Your account has expired.', [
          { text: 'OK', onPress: () => navigation.reset({ index: 0, routes: [{ name: 'Login' }] }) },
        ]);
      } else {
        setTestResult({ success: false, message: error.message || 'Test failed.' });
      }
    } finally {
      setTesting(false);
    }
  };

  const handleDetectApiServer = async () => {
    if (!useRestApiFeatures) {
      Alert.alert(
        'REST API disabled',
        'Turn on "REST API & page footer" below to configure and detect the Sigma REST API server.',
      );
      return;
    }
    if (!hasRestCreds) {
      Alert.alert(
        'Credentials required',
        'Enter embed credentials on the Basic tab (or separate REST API credentials when not using "Same as Embed Key") before detecting the server.',
      );
      return;
    }
    try {
      setDetectingApiServer(true);
      setShowServerPicker(false);
      const found = await SigmaRestApiService.detectWorkingApiServer(resolvedRestClientId, resolvedRestSecret);
      if (found) {
        setSigmaApiBaseUrl(found.baseUrl);
      } else {
        setDetectFailedModalVisible(true);
      }
    } finally {
      setDetectingApiServer(false);
    }
  };

  const handleGetPages = async () => {
    if (!canGetPages) return;
    try {
      setFetchingPages(true);
      setPagesError(null);

      const sigmaPages = await SigmaRestApiService.listPages({
        clientId: resolvedRestClientId,
        clientSecret: resolvedRestSecret,
        baseUrl: sigmaApiBaseUrl,
        workbookId: workbookId!,
        bookmarkId: parsedEmbed?.bookmarkId,
        tagName: parsedEmbed?.tagName,
      });

      setPages((prev) => mergeFetchedPagesWithExisting(sigmaPages, prev));
    } catch (error: any) {
      setPagesError(error.message || 'Failed to fetch pages');
    } finally {
      setFetchingPages(false);
    }
  };

  const togglePageInFooter = (pageId: string) => {
    setPages(prev =>
      prev.map(p => (p.pageId === pageId ? { ...p, showInFooter: !p.showInFooter } : p)),
    );
  };

  const EMOJI_OPTIONS = ['📄', '📊', '📈', '📉', '💰', '🛒', '📋', '⭐', '🏠', '🔍', '⚙️', '📦'];

  const cycleEmoji = (pageId: string) => {
    setPages(prev =>
      prev.map(p => {
        if (p.pageId !== pageId) return p;
        const idx = EMOJI_OPTIONS.indexOf(p.emoji);
        const next = EMOJI_OPTIONS[(idx + 1) % EMOJI_OPTIONS.length];
        return { ...p, emoji: next };
      }),
    );
  };

  const scrollToInput = (isLastField: boolean = false) => {
    setTimeout(() => {
      if (isLastField && scrollViewRef.current) {
        scrollViewRef.current.scrollToEnd({ animated: true });
      }
    }, 300);
  };

  const handleSave = async () => {
    if (!isFormValid) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    if (!testResult || !testResult.success) {
      Alert.alert('Test Recommended', "You haven't tested this configuration yet. Save anyway?", [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Save Anyway', onPress: () => performSave() },
      ]);
      return;
    }
    await performSave();
  };

  const performSave = async () => {
    try {
      setSaving(true);
      const footerPages = useRestApiFeatures && pages.length > 0 ? pages : undefined;

      const created = await MyBuysService.createApplet({
        name,
        embedUrl,
        embedClientId,
        embedSecretKey,
        sigmaApiBaseUrl: useRestApiFeatures && hasRestCreds ? sigmaApiBaseUrl : undefined,
        restApiSameAsEmbed: useRestApiFeatures ? sameAsEmbed : true,
        pageFooterConfig: footerPages ? { pages: footerPages } : undefined,
        restApiClientId: useRestApiFeatures && !sameAsEmbed ? restApiClientId : undefined,
        restApiSecretKey: useRestApiFeatures && !sameAsEmbed ? restApiSecretKey : undefined,
      });

      if (created.deepLinkSlug) {
        Alert.alert(
          'Applet created',
          `Deep link key:\n\n${created.deepLinkSlug}`,
          [
            {
              text: 'Copy key',
              onPress: async () => {
                await Clipboard.setStringAsync(created.deepLinkSlug!);
                navigation.goBack();
              },
            },
            { text: 'OK', onPress: () => navigation.goBack() },
          ],
        );
      } else {
        navigation.goBack();
      }
    } catch (error: any) {
      if (error.isSessionExpired) {
        navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
      } else if (error.isExpirationError) {
        Alert.alert('Account Expired', error.message || 'Your account has expired.', [
          { text: 'OK', onPress: () => navigation.reset({ index: 0, routes: [{ name: 'Login' }] }) },
        ]);
      } else {
        Alert.alert('Error', error.message || 'Failed to create applet.');
      }
    } finally {
      setSaving(false);
    }
  };

  // --- Render ---
  const renderTabBar = () => (
    <View style={styles.tabBar}>
      <TouchableOpacity
        style={[styles.tab, activeTab === 'basic' && styles.tabActive]}
        onPress={() => setActiveTab('basic')}
      >
        <Text style={[styles.tabText, activeTab === 'basic' && styles.tabTextActive]}>Basic</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.tab, activeTab === 'advanced' && styles.tabActive, !advancedTabEnabled && styles.tabDisabled]}
        onPress={() => advancedTabEnabled && setActiveTab('advanced')}
        disabled={!advancedTabEnabled}
      >
        <Text
          style={[
            styles.tabText,
            activeTab === 'advanced' && styles.tabTextActive,
            !advancedTabEnabled && styles.tabTextDisabled,
          ]}
        >
          Advanced
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderBasicTab = () => (
    <>
      {/* Name */}
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

      {/* Embed URL */}
      <View style={styles.fieldContainer}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>Embed URL</Text>
          <TouchableOpacity onPress={() => setEmbedUrlModalVisible(true)} style={styles.infoButton} activeOpacity={0.7}>
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

      {/* Embed Client ID */}
      <View style={styles.fieldContainer}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>Embed Client ID</Text>
          <TouchableOpacity onPress={() => setClientIdModalVisible(true)} style={styles.infoButton} activeOpacity={0.7}>
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

      {/* Embed Secret Key */}
      <View style={styles.fieldContainer}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>Embed Secret Key</Text>
          <TouchableOpacity onPress={() => setSecretKeyModalVisible(true)} style={styles.infoButton} activeOpacity={0.7}>
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
          <TouchableOpacity onPress={() => setShowSecretKey(!showSecretKey)} style={styles.eyeButton} activeOpacity={0.7}>
            <Ionicons name={showSecretKey ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>
    </>
  );

  const renderServerPicker = () => {
    if (!showServerPicker) return null;
    return (
      <View style={styles.pickerDropdown}>
        <ScrollView
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          style={styles.pickerScroll}
          showsVerticalScrollIndicator
        >
          {SIGMA_API_SERVERS.map((s) => (
            <TouchableOpacity
              key={s.url}
              style={[styles.pickerItem, s.url === sigmaApiBaseUrl && styles.pickerItemSelected]}
              onPress={() => {
                setSigmaApiBaseUrl(s.url);
                setShowServerPicker(false);
              }}
            >
              <Text style={[styles.pickerItemText, s.url === sigmaApiBaseUrl && styles.pickerItemTextSelected]}>
                {s.label}
              </Text>
              <Text style={styles.pickerItemUrl}>{s.url.replace('https://', '')}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  };

  const renderAdvancedTab = () => (
    <>
      <View style={[styles.switchRow, styles.switchRowMulti]}>
        <View style={styles.switchLabelBlock}>
          <Text style={styles.switchLabel}>REST API & page footer</Text>
          <Text style={styles.switchSubLabel}>
            Enable to use Sigma REST API (native footer, separate API keys). Test only checks the embed until this is on.
          </Text>
        </View>
        <Switch
          style={styles.switchAlignTop}
          value={useRestApiFeatures}
          onValueChange={setUseRestApiFeatures}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor="#FFFFFF"
        />
      </View>

      {!useRestApiFeatures ? (
        <Text style={styles.hintText}>
          Optional. Leave off if you only need the embedded workbook and your embed keys differ from REST API keys.
        </Text>
      ) : (
        <>
      {/* API Server Dropdown + Detect */}
      <View style={styles.fieldContainer}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>Sigma REST API Server</Text>
          <TouchableOpacity onPress={() => setRestApiInfoModalVisible(true)} style={styles.infoButton} activeOpacity={0.7}>
            <Ionicons name="information-circle-outline" size={20} color={colors.info} />
          </TouchableOpacity>
        </View>
        <View style={styles.serverRow}>
          <View style={styles.serverDropdownCol}>
            <TouchableOpacity
              style={styles.dropdownButton}
              onPress={() => setShowServerPicker(!showServerPicker)}
              activeOpacity={0.7}
            >
              <Text style={styles.dropdownButtonText} numberOfLines={1}>
                {SIGMA_API_SERVERS.find(s => s.url === sigmaApiBaseUrl)?.label || 'Select server'}
              </Text>
              <Ionicons name={showServerPicker ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={[styles.detectButton, (!hasRestCreds || detectingApiServer) && styles.buttonDisabled]}
            onPress={handleDetectApiServer}
            disabled={!hasRestCreds || detectingApiServer}
            activeOpacity={0.7}
          >
            {detectingApiServer ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={styles.detectButtonText}>Detect</Text>
            )}
          </TouchableOpacity>
        </View>
        {renderServerPicker()}
      </View>

      {/* Same as Embed Key toggle */}
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Same as Embed Key</Text>
        <Switch
          value={sameAsEmbed}
          onValueChange={setSameAsEmbed}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor="#FFFFFF"
        />
      </View>

      {/* REST API Client ID */}
      <View style={[styles.fieldContainer, sameAsEmbed && styles.fieldDisabled]}>
        <View style={styles.labelRow}>
          <Text style={[styles.label, sameAsEmbed && styles.labelDisabled]}>REST API Client ID</Text>
        </View>
        <TextInput
          style={[styles.input, sameAsEmbed && styles.inputDisabled]}
          placeholder={sameAsEmbed ? embedClientId || 'Uses embed client ID' : 'Enter REST API client ID'}
          placeholderTextColor={colors.textSecondary}
          value={sameAsEmbed ? '' : restApiClientId}
          onChangeText={setRestApiClientId}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!sameAsEmbed}
        />
      </View>

      {/* REST API Secret */}
      <View style={[styles.fieldContainer, sameAsEmbed && styles.fieldDisabled]}>
        <View style={styles.labelRow}>
          <Text style={[styles.label, sameAsEmbed && styles.labelDisabled]}>REST API Secret</Text>
        </View>
        <View style={styles.secretInputContainer}>
          <TextInput
            style={[styles.input, styles.secretInput, sameAsEmbed && styles.inputDisabled]}
            placeholder={sameAsEmbed ? 'Uses embed secret' : 'Enter REST API secret'}
            placeholderTextColor={colors.textSecondary}
            value={sameAsEmbed ? '' : restApiSecretKey}
            onChangeText={setRestApiSecretKey}
            secureTextEntry={!showRestSecret}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!sameAsEmbed}
          />
          {!sameAsEmbed && (
            <TouchableOpacity onPress={() => setShowRestSecret(!showRestSecret)} style={styles.eyeButton} activeOpacity={0.7}>
              <Ionicons name={showRestSecret ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Get Pages */}
      <View style={styles.fieldContainer}>
        <TouchableOpacity
          style={[styles.getPagesButton, (!canGetPages || fetchingPages) && styles.buttonDisabled]}
          onPress={handleGetPages}
          disabled={!canGetPages || fetchingPages}
          activeOpacity={0.7}
        >
          {fetchingPages ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <>
              <Ionicons name="download-outline" size={20} color={canGetPages ? colors.primary : colors.textSecondary} />
              <Text style={[styles.getPagesButtonText, !canGetPages && { color: colors.textSecondary }]}>
                Get Pages
              </Text>
            </>
          )}
        </TouchableOpacity>
        {!workbookId && embedUrl.trim() && (
          <Text style={styles.hintText}>Could not parse workbook ID from embed URL</Text>
        )}
        {!hasRestCreds && (
          <Text style={styles.hintText}>
            {sameAsEmbed ? 'Enter embed credentials on Basic tab first' : 'Enter REST API credentials above'}
          </Text>
        )}
      </View>

      {/* Pages error */}
      {pagesError && (
        <View style={styles.errorBanner}>
          <Ionicons name="close-circle" size={18} color={colors.error} />
          <Text style={styles.errorBannerText}>{pagesError}</Text>
        </View>
      )}

      {/* Pages list */}
      {pages.length > 0 && (
        <View style={styles.pagesSection}>
          <Text style={styles.pagesSectionTitle}>Pages ({pages.filter(p => p.showInFooter).length} selected for footer)</Text>
          {pages.map(page => (
            <View key={page.pageId} style={styles.pageRow}>
              <TouchableOpacity onPress={() => togglePageInFooter(page.pageId)} style={styles.pageCheckbox}>
                <Ionicons
                  name={page.showInFooter ? 'checkbox' : 'square-outline'}
                  size={24}
                  color={page.showInFooter ? colors.primary : colors.textSecondary}
                />
              </TouchableOpacity>
              <Text style={styles.pageName} numberOfLines={1}>
                {page.name}
              </Text>
              <TouchableOpacity onPress={() => cycleEmoji(page.pageId)} style={styles.emojiButton}>
                <Text style={styles.emojiText}>{page.emoji}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
        </>
      )}
    </>
  );

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoid}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        {renderTabBar()}
        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {activeTab === 'basic' ? renderBasicTab() : renderAdvancedTab()}

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
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Modals */}
      <MyBuysEmbedUrlInfoModal visible={embedUrlModalVisible} onClose={() => setEmbedUrlModalVisible(false)} />
      <ClientIdInfoModal visible={clientIdModalVisible} onClose={() => setClientIdModalVisible(false)} />
      <SecretKeyInfoModal visible={secretKeyModalVisible} onClose={() => setSecretKeyModalVisible(false)} />
      <RestApiInfoModal visible={restApiInfoModalVisible} onClose={() => setRestApiInfoModalVisible(false)} />
      <SigmaApiDetectFailedModal
        visible={detectFailedModalVisible}
        onClose={() => setDetectFailedModalVisible(false)}
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
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  headerButton: {
    padding: spacing.sm,
    marginLeft: spacing.sm,
  },

  // --- Tabs ---
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 3,
    borderBottomColor: colors.primary,
  },
  tabDisabled: {
    opacity: 0.4,
  },
  tabText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.primary,
  },
  tabTextDisabled: {
    color: colors.textSecondary,
  },

  // --- Fields ---
  fieldContainer: {
    marginBottom: spacing.lg,
  },
  fieldDisabled: {
    opacity: 0.45,
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
  labelDisabled: {
    color: colors.textSecondary,
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
  inputDisabled: {
    backgroundColor: colors.surface,
    color: colors.textSecondary,
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

  // --- Dropdown + Detect ---
  serverRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing.sm,
  },
  serverDropdownCol: {
    flex: 2,
    minWidth: 0,
  },
  detectButton: {
    flex: 1,
    minHeight: 50,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
  },
  detectButtonText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.primary,
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    height: 50,
  },
  dropdownButtonText: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
  },
  pickerDropdown: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    marginTop: spacing.xs,
    maxHeight: 260,
    overflow: 'hidden',
  },
  pickerScroll: {
    maxHeight: 260,
  },
  pickerItem: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerItemSelected: {
    backgroundColor: colors.primaryLight,
  },
  pickerItemText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  pickerItemTextSelected: {
    color: colors.primary,
  },
  pickerItemUrl: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },

  // --- Switch ---
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
    paddingVertical: spacing.sm,
  },
  switchRowMulti: {
    alignItems: 'flex-start',
  },
  switchLabelBlock: {
    flex: 1,
    marginRight: spacing.md,
  },
  switchAlignTop: {
    marginTop: 2,
  },
  switchLabel: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  switchSubLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },

  // --- Get Pages ---
  getPagesButton: {
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
  getPagesButtonText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.primary,
  },
  hintText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },

  // --- Error ---
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: '#FEE2E2',
    borderRadius: borderRadius.md,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  errorBannerText: {
    ...typography.bodySmall,
    color: colors.error,
    flex: 1,
  },

  // --- Pages list ---
  pagesSection: {
    marginBottom: spacing.lg,
  },
  pagesSectionTitle: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  pageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
  },
  pageCheckbox: {
    marginRight: spacing.sm,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pageName: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
  },
  emojiButton: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surface,
  },
  emojiText: {
    fontSize: 24,
  },

  // --- Test result ---
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

  // --- Buttons ---
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
});
