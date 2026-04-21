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
  DeviceEventEmitter,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RouteProp } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { MyBuysService } from '../../services/MyBuysService';
import { SigmaRestApiService } from '../../services/SigmaRestApiService';
import { colors, spacing, borderRadius, typography } from '../../constants/Theme';
import { DEFAULT_APPLET_THEME_ID, getAppletAccentColor, normalizeThemeCustomHex, resolveAppletThemeId, type AppletThemeId } from '../../constants/AppletThemes';
import { MyBuysThemeSelector } from '../../components/MyBuysThemeSelector';
import { IconPicker } from '../../components/IconPicker';
import { MY_BUYS_APPLETS_CHANGED, type MyBuysAppletsChangedPayload } from '../../constants/MyBuysEvents';
import { MyBuysEmbedUrlInfoModal } from '../../components/MyBuysEmbedUrlInfoModal';
import { ClientIdInfoModal } from '../../components/ClientIdInfoModal';
import { SecretKeyInfoModal } from '../../components/SecretKeyInfoModal';
import { DeepLinkKeyInfoModal } from '../../components/DeepLinkKeyInfoModal';
import { RestApiInfoModal } from '../../components/RestApiInfoModal';
import { SigmaApiDetectFailedModal } from '../../components/SigmaApiDetectFailedModal';
import { SIGMA_API_SERVERS, DEFAULT_SIGMA_API_SERVER } from '../../constants/SigmaApiServers';
import { parseSigmaEmbedUrl } from '../../utils/parseSigmaEmbedUrl';
import { mergeFetchedPagesWithExisting } from '../../utils/mergeSigmaPagesWithConfig';
import type { RootStackParamList } from '../_layout';
import type { Applet, PageFooterPageConfig } from '../../types/mybuys.types';

type EditMyBuysAppletScreenNavigationProp = StackNavigationProp<RootStackParamList, 'EditMyBuysApplet'>;
type EditMyBuysAppletScreenRouteProp = RouteProp<RootStackParamList, 'EditMyBuysApplet'>;

type TabName = 'basic' | 'advanced';
const EMOJI_OPTIONS = ['📄', '📊', '📈', '📉', '💰', '🛒', '📋', '⭐', '🏠', '🔍', '⚙️', '📦'];

export default function EditMyBuysApplet() {
  const navigation = useNavigation<EditMyBuysAppletScreenNavigationProp>();
  const route = useRoute<EditMyBuysAppletScreenRouteProp>();
  const { appletId } = route.params;

  const [applet, setApplet] = useState<Applet | null>(null);
  const [loading, setLoading] = useState(true);

  // --- Basic ---
  const [name, setName] = useState('');
  const [embedUrl, setEmbedUrl] = useState('');
  const [embedClientId, setEmbedClientId] = useState('');
  const [embedSecretKey, setEmbedSecretKey] = useState('');
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [themeId, setThemeId] = useState<AppletThemeId>(DEFAULT_APPLET_THEME_ID);
  const [themeCustomHex, setThemeCustomHex] = useState('#3B6FA0');
  const [iconName, setIconName] = useState<string>('layers-outline');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // --- Advanced ---
  const [activeTab, setActiveTab] = useState<TabName>('basic');
  const [sigmaApiBaseUrl, setSigmaApiBaseUrl] = useState(DEFAULT_SIGMA_API_SERVER);
  const [showServerPicker, setShowServerPicker] = useState(false);
  /** When false, Test only validates embed; REST API / footer UI is hidden. */
  const [useRestApiFeatures, setUseRestApiFeatures] = useState(false);
  const [sameAsEmbed, setSameAsEmbed] = useState(true);
  const [restApiClientId, setRestApiClientId] = useState('');
  const [restApiSecretKey, setRestApiSecretKey] = useState('');
  const [showRestSecret, setShowRestSecret] = useState(false);
  const [fetchingPages, setFetchingPages] = useState(false);
  const [pagesError, setPagesError] = useState<string | null>(null);
  const [pages, setPages] = useState<PageFooterPageConfig[]>([]);

  // --- Modals ---
  const [embedUrlModalVisible, setEmbedUrlModalVisible] = useState(false);
  const [clientIdModalVisible, setClientIdModalVisible] = useState(false);
  const [secretKeyModalVisible, setSecretKeyModalVisible] = useState(false);
  const [deepLinkKeyModalVisible, setDeepLinkKeyModalVisible] = useState(false);
  const [restApiInfoModalVisible, setRestApiInfoModalVisible] = useState(false);
  const [detectingApiServer, setDetectingApiServer] = useState(false);
  const [detectFailedModalVisible, setDetectFailedModalVisible] = useState(false);

  const embedUrlInputRef = useRef<TextInput>(null);
  const embedClientIdInputRef = useRef<TextInput>(null);
  const embedSecretKeyInputRef = useRef<TextInput>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  const headerAccent = getAppletAccentColor(themeId, themeCustomHex);

  useEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton} activeOpacity={0.7}>
          <Ionicons name="close" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      ),
      headerStatusBarHeight: 0,
      headerStyle: {
        backgroundColor: headerAccent,
        elevation: 0,
        shadowOpacity: 0,
        borderBottomWidth: 0,
        height: Platform.OS === 'ios' ? 48 : 52,
      },
      headerTintColor: '#FFFFFF',
      headerTitleStyle: {
        fontSize: 17,
        fontWeight: '600',
        color: '#FFFFFF',
      },
      headerLeftContainerStyle: { paddingLeft: 4 },
      headerTitleContainerStyle: {
        marginHorizontal: 0,
      },
    });
  }, [navigation, headerAccent]);

  // --- Load applet ---
  useEffect(() => {
    const loadApplet = async () => {
      try {
        setLoading(true);
        const applets = await MyBuysService.listApplets();
        const found = applets.find(a => a.appletId === appletId);
        if (!found) {
          Alert.alert('Error', 'Applet not found', [{ text: 'OK', onPress: () => navigation.goBack() }]);
          return;
        }
        setApplet(found);
        setName(found.name);
        const loadedThemeId = resolveAppletThemeId(found.themeId ?? null, found.themeId ?? null);
        const loadedHex = found.themeCustomHex || '#3B6FA0';
        setThemeId(loadedThemeId);
        setThemeCustomHex(loadedHex);
        setIconName(found.iconName || 'layers-outline');
        setEmbedUrl(found.embedUrl);
        setSigmaApiBaseUrl(found.sigmaApiBaseUrl || DEFAULT_SIGMA_API_SERVER);
        setSameAsEmbed(found.restApiSameAsEmbed !== false);
        setUseRestApiFeatures(
          found.restApiSameAsEmbed === false ||
            (found.pageFooterConfig?.pages?.length ?? 0) > 0,
        );
        if (found.pageFooterConfig?.pages) {
          setPages(found.pageFooterConfig.pages);
        }

        if (found.secretName) {
          try {
            const secretData = await MyBuysService.getSecretByName(found.secretName);
            if (secretData) {
              setEmbedClientId(secretData.clientId);
              setEmbedSecretKey(secretData.secretKey);
            }
          } catch { /* user can enter manually */ }

          if (found.restApiSameAsEmbed === false) {
            try {
              const restSecret = await MyBuysService.getSecretByName(found.secretName + '__sigma_rest');
              if (restSecret) {
                setRestApiClientId(restSecret.clientId);
                setRestApiSecretKey(restSecret.secretKey);
              }
            } catch { /* optional */ }
          }
        }
      } catch (error: any) {
        if (error.isSessionExpired) {
          navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        } else if (error.isExpirationError) {
          Alert.alert('Account Expired', error.message || 'Your account has expired.', [
            { text: 'OK', onPress: () => navigation.reset({ index: 0, routes: [{ name: 'Login' }] }) },
          ]);
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

  // --- Auto-populate on URL change ---
  useEffect(() => {
    const autoPopulate = async () => {
      if (!embedUrl.trim()) return;
      const secretName = MyBuysService.extractSecretNameFromUrl(embedUrl);
      if (!secretName) return;
      try {
        const secretData = await MyBuysService.getSecretByName(secretName);
        if (secretData) {
          if (!embedClientId.trim()) setEmbedClientId(secretData.clientId);
          if (!embedSecretKey.trim()) setEmbedSecretKey(secretData.secretKey);
        }
      } catch { /* silent */ }
    };
    const t = setTimeout(autoPopulate, 500);
    return () => clearTimeout(t);
  }, [embedUrl]);

  // --- Derived ---
  const isFormValid = name.trim() && embedUrl.trim() && embedClientId.trim() && embedSecretKey.trim();
  const advancedTabEnabled = !!embedUrl.trim();
  const parsedEmbed = useMemo(() => parseSigmaEmbedUrl(embedUrl), [embedUrl]);
  const workbookId = parsedEmbed?.workbookId ?? null;
  const resolvedRestClientId = sameAsEmbed ? embedClientId : restApiClientId;
  const resolvedRestSecret = sameAsEmbed ? embedSecretKey : restApiSecretKey;
  const hasRestCreds =
    useRestApiFeatures && !!resolvedRestClientId.trim() && !!resolvedRestSecret.trim();
  const canGetPages = useRestApiFeatures && !!workbookId && hasRestCreds;

  const handleCopyDeepLinkKey = async () => {
    if (!applet?.deepLinkSlug) return;
    await Clipboard.setStringAsync(applet.deepLinkSlug);
    try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
  };

  const handleTest = async () => {
    if (!isFormValid) { Alert.alert('Error', 'Please fill in all fields before testing'); return; }
    try {
      setTesting(true);
      setTestResult(null);
      const result = await MyBuysService.testConfiguration({ embedUrl, embedClientId, embedSecretKey });
      if (!result.success) { setTestResult({ success: false, message: `Embed: ${result.message}` }); return; }
      if (useRestApiFeatures && hasRestCreds) {
        const whoami = await SigmaRestApiService.whoami(resolvedRestClientId, resolvedRestSecret, sigmaApiBaseUrl);
        if (!whoami.success) { setTestResult({ success: false, message: `Embed OK, REST API: ${whoami.message}` }); return; }
        setTestResult({ success: true, message: `Embed OK (HTTP ${result.statusCode}). REST API verified.` });
      } else {
        setTestResult({ success: true, message: `Test successful! (HTTP ${result.statusCode})` });
      }
    } catch (error: any) {
      if (error.isSessionExpired) { navigation.reset({ index: 0, routes: [{ name: 'Login' }] }); }
      else if (error.isExpirationError) { Alert.alert('Account Expired', error.message, [{ text: 'OK', onPress: () => navigation.reset({ index: 0, routes: [{ name: 'Login' }] }) }]); }
      else { setTestResult({ success: false, message: error.message || 'Test failed.' }); }
    } finally { setTesting(false); }
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
      setFetchingPages(true); setPagesError(null);
      const sigmaPages = await SigmaRestApiService.listPages({
        clientId: resolvedRestClientId, clientSecret: resolvedRestSecret,
        baseUrl: sigmaApiBaseUrl, workbookId: workbookId!,
        bookmarkId: parsedEmbed?.bookmarkId, tagName: parsedEmbed?.tagName,
      });
      setPages((prev) => mergeFetchedPagesWithExisting(sigmaPages, prev));
    } catch (error: any) { setPagesError(error.message || 'Failed to fetch pages'); }
    finally { setFetchingPages(false); }
  };

  const togglePageInFooter = (pageId: string) => {
    setPages(prev => prev.map(p => (p.pageId === pageId ? { ...p, showInFooter: !p.showInFooter } : p)));
  };

  const cycleEmoji = (pageId: string) => {
    setPages(prev => prev.map(p => {
      if (p.pageId !== pageId) return p;
      const idx = EMOJI_OPTIONS.indexOf(p.emoji);
      return { ...p, emoji: EMOJI_OPTIONS[(idx + 1) % EMOJI_OPTIONS.length] };
    }));
  };

  const scrollToInput = (isLastField = false) => {
    setTimeout(() => { if (isLastField && scrollViewRef.current) scrollViewRef.current.scrollToEnd({ animated: true }); }, 300);
  };

  const handleSave = async () => {
    if (!isFormValid) { Alert.alert('Error', 'Please fill in all fields'); return; }
    if (!testResult || !testResult.success) {
      Alert.alert('Test Recommended', "You haven't tested yet. Save anyway?", [
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
      await MyBuysService.updateApplet(appletId, {
        name, embedUrl, embedClientId, embedSecretKey,
        themeId,
        themeCustomHex: themeId === 'custom' ? themeCustomHex : undefined,
        iconName,
        sigmaApiBaseUrl: useRestApiFeatures && hasRestCreds ? sigmaApiBaseUrl : undefined,
        restApiSameAsEmbed: useRestApiFeatures ? sameAsEmbed : true,
        pageFooterConfig: footerPages ? { pages: footerPages } : undefined,
        restApiClientId: useRestApiFeatures && !sameAsEmbed ? restApiClientId : undefined,
        restApiSecretKey: useRestApiFeatures && !sameAsEmbed ? restApiSecretKey : undefined,
      });
      const normalizedCustom = normalizeThemeCustomHex(themeCustomHex);
      const payload: MyBuysAppletsChangedPayload = {
        action: 'updated',
        appletId,
        themeId,
        ...(themeId === 'custom'
          ? { themeCustomHex: normalizedCustom || themeCustomHex.trim() || undefined }
          : {}),
      };
      DeviceEventEmitter.emit(MY_BUYS_APPLETS_CHANGED, payload);
      navigation.goBack();
    } catch (error: any) {
      if (error.isSessionExpired) { navigation.reset({ index: 0, routes: [{ name: 'Login' }] }); }
      else if (error.isExpirationError) { Alert.alert('Account Expired', error.message, [{ text: 'OK', onPress: () => navigation.reset({ index: 0, routes: [{ name: 'Login' }] }) }]); }
      else { Alert.alert('Error', error.message || 'Failed to update applet.'); }
    } finally { setSaving(false); }
  };

  const handleDelete = () => {
    Alert.alert('Delete Applet', 'Are you sure? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await MyBuysService.deleteApplet(appletId);
            DeviceEventEmitter.emit(MY_BUYS_APPLETS_CHANGED, { action: 'deleted', appletId } as MyBuysAppletsChangedPayload);
            navigation.goBack();
          } catch (error: any) {
            if (error.isSessionExpired) navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
            else Alert.alert('Error', error.message || 'Failed to delete applet.');
          }
        },
      },
    ]);
  };

  // ---- Render helpers ----
  const renderTabBar = () => (
    <View style={styles.tabBar}>
      <TouchableOpacity style={[styles.tab, activeTab === 'basic' && styles.tabActive]} onPress={() => setActiveTab('basic')}>
        <Text style={[styles.tabText, activeTab === 'basic' && styles.tabTextActive]}>Basic</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.tab, activeTab === 'advanced' && styles.tabActive, !advancedTabEnabled && styles.tabDisabled]}
        onPress={() => advancedTabEnabled && setActiveTab('advanced')}
        disabled={!advancedTabEnabled}
      >
        <Text style={[styles.tabText, activeTab === 'advanced' && styles.tabTextActive, !advancedTabEnabled && styles.tabTextDisabled]}>
          Advanced
        </Text>
      </TouchableOpacity>
    </View>
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

  const renderBasicTab = () => (
    <>
      <View style={styles.fieldContainer}>
        <View style={styles.labelRow}><Text style={styles.label}>Name</Text><Text style={styles.charCount}>{name.length}/35</Text></View>
        <TextInput style={styles.input} placeholder="e.g. Demand Planning" placeholderTextColor={colors.textSecondary} value={name} onChangeText={setName} maxLength={35} autoCapitalize="words" returnKeyType="next" onSubmitEditing={() => embedUrlInputRef.current?.focus()} />
      </View>

      <View style={styles.fieldContainer}>
        <MyBuysThemeSelector
          themeId={themeId}
          customHex={themeCustomHex}
          onThemeIdChange={setThemeId}
          onCustomHexChange={setThemeCustomHex}
        />
      </View>

      <View style={styles.fieldContainer}>
        <Text style={styles.label}>Icon</Text>
        <IconPicker
          value={iconName}
          onChange={setIconName}
          accentColor={getAppletAccentColor(themeId, themeCustomHex)}
        />
      </View>

      {applet?.deepLinkSlug ? (
        <View style={styles.fieldContainer}>
          <View style={styles.labelRow}>
            <Text style={[styles.label, styles.labelDisabled]}>Deep link key</Text>
            <TouchableOpacity onPress={() => setDeepLinkKeyModalVisible(true)} style={styles.infoButton} activeOpacity={0.7}>
              <Ionicons name="information-circle-outline" size={20} color={colors.info} />
            </TouchableOpacity>
            <View style={{ flex: 1 }} />
            <TouchableOpacity onPress={handleCopyDeepLinkKey} style={styles.copyKeyButton} activeOpacity={0.7}>
              <Text style={styles.copyKeyButtonText}>Copy</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.readonlySlugContainer}>
            <Text style={styles.readonlySlugText} selectable>
              {applet.deepLinkSlug}
            </Text>
          </View>
        </View>
      ) : null}

      <View style={styles.fieldContainer}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>Embed URL</Text>
          <TouchableOpacity onPress={() => setEmbedUrlModalVisible(true)} style={styles.infoButton} activeOpacity={0.7}><Ionicons name="information-circle-outline" size={20} color={colors.info} /></TouchableOpacity>
        </View>
        <TextInput ref={embedUrlInputRef} style={[styles.input, styles.urlInput]} placeholder="https://app.sigmacomputing.com/..." placeholderTextColor={colors.textSecondary} value={embedUrl} onChangeText={setEmbedUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" returnKeyType="next" onSubmitEditing={() => embedClientIdInputRef.current?.focus()} blurOnSubmit={true} />
      </View>

      <View style={styles.fieldContainer}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>Embed Client ID</Text>
          <TouchableOpacity onPress={() => setClientIdModalVisible(true)} style={styles.infoButton} activeOpacity={0.7}><Ionicons name="information-circle-outline" size={20} color={colors.info} /></TouchableOpacity>
        </View>
        <TextInput ref={embedClientIdInputRef} style={styles.input} placeholder="Enter your embed client ID" placeholderTextColor={colors.textSecondary} value={embedClientId} onChangeText={setEmbedClientId} autoCapitalize="none" autoCorrect={false} returnKeyType="next" onSubmitEditing={() => { embedSecretKeyInputRef.current?.focus(); scrollToInput(true); }} />
      </View>

      <View style={styles.fieldContainer}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>Embed Secret Key</Text>
          <TouchableOpacity onPress={() => setSecretKeyModalVisible(true)} style={styles.infoButton} activeOpacity={0.7}><Ionicons name="information-circle-outline" size={20} color={colors.info} /></TouchableOpacity>
        </View>
        <View style={styles.secretInputContainer}>
          <TextInput ref={embedSecretKeyInputRef} style={[styles.input, styles.secretInput]} placeholder="Enter your embed secret key" placeholderTextColor={colors.textSecondary} value={embedSecretKey} onChangeText={setEmbedSecretKey} secureTextEntry={!showSecretKey} autoCapitalize="none" autoCorrect={false} returnKeyType="done" blurOnSubmit={true} onFocus={() => scrollToInput(true)} />
          <TouchableOpacity onPress={() => setShowSecretKey(!showSecretKey)} style={styles.eyeButton} activeOpacity={0.7}>
            <Ionicons name={showSecretKey ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>
    </>
  );

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
      <View style={styles.fieldContainer}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>Sigma REST API Server</Text>
          <TouchableOpacity onPress={() => setRestApiInfoModalVisible(true)} style={styles.infoButton} activeOpacity={0.7}><Ionicons name="information-circle-outline" size={20} color={colors.info} /></TouchableOpacity>
        </View>
        <View style={styles.serverRow}>
          <View style={styles.serverDropdownCol}>
            <TouchableOpacity style={styles.dropdownButton} onPress={() => setShowServerPicker(!showServerPicker)} activeOpacity={0.7}>
              <Text style={styles.dropdownButtonText} numberOfLines={1}>{SIGMA_API_SERVERS.find(s => s.url === sigmaApiBaseUrl)?.label || 'Select server'}</Text>
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

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Same as Embed Key</Text>
        <Switch value={sameAsEmbed} onValueChange={setSameAsEmbed} trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#FFFFFF" />
      </View>

      <View style={[styles.fieldContainer, sameAsEmbed && styles.fieldDisabled]}>
        <Text style={[styles.label, sameAsEmbed && styles.labelDisabled]}>REST API Client ID</Text>
        <TextInput style={[styles.input, sameAsEmbed && styles.inputDisabled]} placeholder={sameAsEmbed ? embedClientId || 'Uses embed client ID' : 'Enter REST API client ID'} placeholderTextColor={colors.textSecondary} value={sameAsEmbed ? '' : restApiClientId} onChangeText={setRestApiClientId} autoCapitalize="none" autoCorrect={false} editable={!sameAsEmbed} />
      </View>

      <View style={[styles.fieldContainer, sameAsEmbed && styles.fieldDisabled]}>
        <Text style={[styles.label, sameAsEmbed && styles.labelDisabled]}>REST API Secret</Text>
        <View style={styles.secretInputContainer}>
          <TextInput style={[styles.input, styles.secretInput, sameAsEmbed && styles.inputDisabled]} placeholder={sameAsEmbed ? 'Uses embed secret' : 'Enter REST API secret'} placeholderTextColor={colors.textSecondary} value={sameAsEmbed ? '' : restApiSecretKey} onChangeText={setRestApiSecretKey} secureTextEntry={!showRestSecret} autoCapitalize="none" autoCorrect={false} editable={!sameAsEmbed} />
          {!sameAsEmbed && (
            <TouchableOpacity onPress={() => setShowRestSecret(!showRestSecret)} style={styles.eyeButton} activeOpacity={0.7}>
              <Ionicons name={showRestSecret ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.fieldContainer}>
        <TouchableOpacity style={[styles.getPagesButton, (!canGetPages || fetchingPages) && styles.buttonDisabled]} onPress={handleGetPages} disabled={!canGetPages || fetchingPages} activeOpacity={0.7}>
          {fetchingPages ? <ActivityIndicator size="small" color={colors.primary} /> : (
            <><Ionicons name="download-outline" size={20} color={canGetPages ? colors.primary : colors.textSecondary} /><Text style={[styles.getPagesButtonText, !canGetPages && { color: colors.textSecondary }]}>Get Pages</Text></>
          )}
        </TouchableOpacity>
        {!workbookId && embedUrl.trim() && <Text style={styles.hintText}>Could not parse workbook ID from embed URL</Text>}
        {!hasRestCreds && <Text style={styles.hintText}>{sameAsEmbed ? 'Enter embed credentials on Basic tab first' : 'Enter REST API credentials above'}</Text>}
      </View>

      {pagesError && (
        <View style={styles.errorBanner}><Ionicons name="close-circle" size={18} color={colors.error} /><Text style={styles.errorBannerText}>{pagesError}</Text></View>
      )}

      {pages.length > 0 && (
        <View style={styles.pagesSection}>
          <Text style={styles.pagesSectionTitle}>Pages ({pages.filter(p => p.showInFooter).length} selected for footer)</Text>
          {pages.map(page => (
            <View key={page.pageId} style={styles.pageRow}>
              <TouchableOpacity onPress={() => togglePageInFooter(page.pageId)} style={styles.pageCheckbox}>
                <Ionicons name={page.showInFooter ? 'checkbox' : 'square-outline'} size={24} color={page.showInFooter ? colors.primary : colors.textSecondary} />
              </TouchableOpacity>
              <Text style={styles.pageName} numberOfLines={1}>{page.name}</Text>
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

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right']}>
        <View style={styles.loadingContainer}><ActivityIndicator size="large" color={colors.primary} /><Text style={styles.loadingText}>Loading applet...</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardAvoid} keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}>
        {renderTabBar()}
        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          contentInset={{ top: 0, bottom: 0, left: 0, right: 0 }}
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
          automaticallyAdjustsScrollIndicatorInsets={false}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          {activeTab === 'basic' ? renderBasicTab() : renderAdvancedTab()}

          {testResult && (
            <View style={[styles.testResultContainer, testResult.success ? styles.testResultSuccess : styles.testResultError]}>
              <Ionicons name={testResult.success ? 'checkmark-circle' : 'close-circle'} size={20} color={testResult.success ? colors.success : colors.error} />
              <Text style={[styles.testResultText, testResult.success ? styles.testResultTextSuccess : styles.testResultTextError]}>{testResult.message}</Text>
            </View>
          )}

          <View style={styles.buttonContainer}>
            <TouchableOpacity style={[styles.testButton, (!isFormValid || testing) && styles.buttonDisabled]} onPress={handleTest} disabled={!isFormValid || testing} activeOpacity={0.7}>
              {testing ? <ActivityIndicator size="small" color={colors.primary} /> : (<><Ionicons name="checkmark-circle-outline" size={20} color={colors.primary} /><Text style={styles.testButtonText}>Test</Text></>)}
            </TouchableOpacity>
            <TouchableOpacity style={[styles.saveButton, (!isFormValid || saving) && styles.buttonDisabled]} onPress={handleSave} disabled={!isFormValid || saving} activeOpacity={0.7}>
              {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : (<><Ionicons name="save-outline" size={20} color="#FFFFFF" /><Text style={styles.saveButtonText}>Save</Text></>)}
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.deleteButton} onPress={handleDelete} activeOpacity={0.7}>
            <Ionicons name="trash-outline" size={20} color="#FFFFFF" /><Text style={styles.deleteButtonText}>Delete</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      <MyBuysEmbedUrlInfoModal visible={embedUrlModalVisible} onClose={() => setEmbedUrlModalVisible(false)} />
      <ClientIdInfoModal visible={clientIdModalVisible} onClose={() => setClientIdModalVisible(false)} />
      <SecretKeyInfoModal visible={secretKeyModalVisible} onClose={() => setSecretKeyModalVisible(false)} />
      <DeepLinkKeyInfoModal visible={deepLinkKeyModalVisible} onClose={() => setDeepLinkKeyModalVisible(false)} />
      <RestApiInfoModal visible={restApiInfoModalVisible} onClose={() => setRestApiInfoModalVisible(false)} />
      <SigmaApiDetectFailedModal
        visible={detectFailedModalVisible}
        onClose={() => setDetectFailedModalVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { ...typography.body, color: colors.textSecondary, marginTop: spacing.md },
  keyboardAvoid: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  headerButton: { paddingVertical: 6, paddingHorizontal: 6, marginLeft: 2, justifyContent: 'center', alignItems: 'center', minWidth: 40, minHeight: 40 },

  tabBar: { flexDirection: 'row', backgroundColor: colors.background, borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { flex: 1, paddingVertical: spacing.sm, alignItems: 'center' },
  tabActive: { borderBottomWidth: 3, borderBottomColor: colors.primary },
  tabDisabled: { opacity: 0.4 },
  tabText: { ...typography.body, fontWeight: '600', color: colors.textSecondary },
  tabTextActive: { color: colors.primary },
  tabTextDisabled: { color: colors.textSecondary },

  fieldContainer: { marginBottom: spacing.md },
  fieldDisabled: { opacity: 0.45 },
  labelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs },
  label: { ...typography.body, fontWeight: '600', color: colors.textPrimary, marginRight: spacing.sm },
  labelDisabled: { color: colors.textSecondary },
  infoButton: { padding: spacing.xs },
  input: { fontSize: typography.body.fontSize, fontWeight: typography.body.fontWeight, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, paddingTop: 0, paddingBottom: 0, height: 50, color: colors.textPrimary, textAlignVertical: 'center', includeFontPadding: false },
  inputDisabled: { backgroundColor: colors.surface, color: colors.textSecondary },
  urlInput: { height: 50 },
  secretInputContainer: { flexDirection: 'row', alignItems: 'center' },
  secretInput: { flex: 1, marginRight: spacing.sm },
  eyeButton: { padding: spacing.sm },
  charCount: { ...typography.caption, color: colors.textSecondary, marginLeft: 'auto' },
  copyKeyButton: { paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  copyKeyButtonText: { ...typography.bodySmall, fontWeight: '600', color: colors.primary },
  readonlySlugContainer: {
    height: 50,
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
  },
  readonlySlugText: { ...typography.body, color: colors.textSecondary },

  serverRow: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.sm },
  serverDropdownCol: { flex: 2, minWidth: 0 },
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
  detectButtonText: { ...typography.body, fontWeight: '600', color: colors.primary },
  buttonDisabled: { opacity: 0.5 },

  dropdownButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, height: 50 },
  dropdownButtonText: { ...typography.body, color: colors.textPrimary, flex: 1 },
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
  pickerItem: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  pickerItemSelected: { backgroundColor: colors.primaryLight },
  pickerItemText: { ...typography.bodySmall, fontWeight: '600', color: colors.textPrimary },
  pickerItemTextSelected: { color: colors.primary },
  pickerItemUrl: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },

  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md, paddingVertical: spacing.xs },
  switchRowMulti: { alignItems: 'flex-start' },
  switchLabelBlock: { flex: 1, marginRight: spacing.md },
  switchAlignTop: { marginTop: 2 },
  switchLabel: { ...typography.body, fontWeight: '600', color: colors.textPrimary },
  switchSubLabel: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },

  getPagesButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.lg, borderRadius: borderRadius.md, backgroundColor: colors.background, borderWidth: 2, borderColor: colors.primary, gap: spacing.sm },
  getPagesButtonText: { ...typography.body, fontWeight: '600', color: colors.primary },
  hintText: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs, textAlign: 'center' },

  errorBanner: { flexDirection: 'row', alignItems: 'center', padding: spacing.sm, backgroundColor: '#FEE2E2', borderRadius: borderRadius.md, marginBottom: spacing.md, gap: spacing.sm },
  errorBannerText: { ...typography.bodySmall, color: colors.error, flex: 1 },

  pagesSection: { marginBottom: spacing.md },
  pagesSectionTitle: { ...typography.bodySmall, fontWeight: '600', color: colors.textPrimary, marginBottom: spacing.xs },
  pageRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginBottom: spacing.xs },
  pageCheckbox: { marginRight: spacing.sm, minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  pageName: { ...typography.body, color: colors.textPrimary, flex: 1 },
  emojiButton: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: borderRadius.sm, backgroundColor: colors.surface },
  emojiText: { fontSize: 24 },

  testResultContainer: { flexDirection: 'row', alignItems: 'center', padding: spacing.sm, borderRadius: borderRadius.md, marginBottom: spacing.md },
  testResultSuccess: { backgroundColor: '#D1FAE5' },
  testResultError: { backgroundColor: '#FEE2E2' },
  testResultText: { ...typography.bodySmall, marginLeft: spacing.sm, flex: 1 },
  testResultTextSuccess: { color: colors.success },
  testResultTextError: { color: colors.error },

  buttonContainer: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  testButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.lg, borderRadius: borderRadius.md, backgroundColor: colors.background, borderWidth: 2, borderColor: colors.primary, gap: spacing.sm },
  testButtonText: { ...typography.body, fontWeight: '600', color: colors.primary },
  saveButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.lg, borderRadius: borderRadius.md, backgroundColor: colors.primary, gap: spacing.sm },
  saveButtonText: { ...typography.body, fontWeight: '600', color: '#FFFFFF' },
  deleteButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.lg, borderRadius: borderRadius.md, backgroundColor: colors.error, marginTop: spacing.md, marginBottom: 0, gap: spacing.sm },
  deleteButtonText: { ...typography.body, fontWeight: '600', color: '#FFFFFF' },
});
