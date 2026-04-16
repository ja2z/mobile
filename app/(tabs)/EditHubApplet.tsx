import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  DeviceEventEmitter,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RouteProp } from '@react-navigation/native';
import { colors, spacing, borderRadius, typography, shadows } from '../../constants/Theme';
import {
  DEFAULT_APPLET_THEME_ID,
  getAppletAccentColor,
  normalizeThemeCustomHex,
  type AppletThemeId,
} from '../../constants/AppletThemes';
import { MyBuysThemeSelector } from '../../components/MyBuysThemeSelector';
import { AuthService } from '../../services/AuthService';
import {
  HUB_PERSONALIZATIONS_CHANGED,
  saveOverride,
  removeOverride,
} from '../../utils/hubPersonalizationStorage';
import type { RootStackParamList } from '../_layout';

type Nav = StackNavigationProp<RootStackParamList, 'EditHubApplet'>;
type Route = RouteProp<RootStackParamList, 'EditHubApplet'>;

export default function EditHubApplet() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { itemId, currentName, currentThemeId, currentThemeCustomHex } = route.params;

  const [name, setName] = useState(currentName);
  const [themeId, setThemeId] = useState<AppletThemeId>(
    (currentThemeId as AppletThemeId) || DEFAULT_APPLET_THEME_ID,
  );
  const [themeCustomHex, setThemeCustomHex] = useState(currentThemeCustomHex || '#3B6FA0');

  const nameRef = useRef(name);
  const themeIdRef = useRef(themeId);
  const themeCustomHexRef = useRef(themeCustomHex);

  nameRef.current = name;
  themeIdRef.current = themeId;
  themeCustomHexRef.current = themeCustomHex;

  const headerAccent = getAppletAccentColor(themeId, themeCustomHex);

  const persistCurrent = useCallback(async () => {
    const trimmed = nameRef.current.trim() || currentName;
    const tid = themeIdRef.current;
    const hex = themeCustomHexRef.current;
    const session = await AuthService.getSession();
    if (!session?.user?.userId) return;

    const matchesDefaultName = trimmed === currentName.trim();
    const defaultAccent = getAppletAccentColor(DEFAULT_APPLET_THEME_ID, undefined);
    let matchesDefaultTheme = tid === DEFAULT_APPLET_THEME_ID;
    if (!matchesDefaultTheme && tid === 'custom') {
      const a = normalizeThemeCustomHex(hex);
      const b = normalizeThemeCustomHex(defaultAccent);
      matchesDefaultTheme = a === b;
    }

    if (matchesDefaultName && matchesDefaultTheme) {
      await removeOverride(session.user.userId, itemId);
    } else {
      await saveOverride(session.user.userId, itemId, {
        displayName: trimmed,
        themeId: tid,
        themeCustomHex: tid === 'custom' ? hex : undefined,
      });
    }
    DeviceEventEmitter.emit(HUB_PERSONALIZATIONS_CHANGED);
  }, [itemId, currentName]);

  useFocusEffect(
    useCallback(() => {
      return () => {
        void persistCurrent().catch(() => {
          /* non-blocking */
        });
      };
    }, [persistCurrent]),
  );

  const handleReset = async () => {
    try {
      const session = await AuthService.getSession();
      if (!session?.user?.userId) return;
      await removeOverride(session.user.userId, itemId);
      DeviceEventEmitter.emit(HUB_PERSONALIZATIONS_CHANGED);
      setName(currentName);
      setThemeId(DEFAULT_APPLET_THEME_ID);
      setThemeCustomHex('#3B6FA0');
    } catch {
      Alert.alert('Error', 'Failed to reset.');
    }
  };

  return (
    <View style={styles.screenRoot}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardAvoid}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 20}
      >
        <View style={styles.card}>
          <View style={[styles.titleRow, { backgroundColor: headerAccent }]}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={styles.headerButton}
              activeOpacity={0.7}
              accessibilityLabel="Close"
              accessibilityRole="button"
            >
              <Ionicons name="close" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.cardTitle}>Personalize</Text>
            <View style={styles.titleSideSpacer} />
          </View>

          <View style={styles.cardBody}>
            <View style={styles.fieldContainer}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>Display name</Text>
                <Text style={styles.charCount}>{name.length}/35</Text>
              </View>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={(t) => setName(t.slice(0, 35))}
                placeholder="App name"
                placeholderTextColor={colors.textSecondary}
                maxLength={35}
                returnKeyType="done"
                autoCorrect={false}
              />
            </View>

            <View style={styles.themeWrap}>
              <MyBuysThemeSelector
                themeId={themeId}
                customHex={themeCustomHex}
                onThemeIdChange={setThemeId}
                onCustomHexChange={setThemeCustomHex}
              />
            </View>

            <TouchableOpacity style={styles.resetButton} onPress={handleReset} activeOpacity={0.7}>
              <Ionicons name="refresh-outline" size={18} color={colors.textSecondary} />
              <Text style={styles.resetButtonText}>Reset to default</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  /** Fills the stack card area; centers the white sheet vertically. */
  screenRoot: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  keyboardAvoid: {
    width: '100%',
    flex: 1,
    justifyContent: 'center',
  },
  /** Single white surface; height matches contents (no stack header above). */
  card: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    ...shadows.medium,
  },
  /** Matches EditMyBuysApplet stack header: full accent bar, white title + close. */
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 4,
    paddingRight: spacing.xs,
    minHeight: Platform.OS === 'ios' ? 48 : 52,
    borderBottomWidth: 0,
  },
  headerButton: {
    paddingVertical: 6,
    paddingHorizontal: 6,
    marginLeft: 2,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 40,
    minHeight: 40,
  },
  cardTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
    color: '#FFFFFF',
  },
  titleSideSpacer: {
    width: 44,
    height: 44,
  },
  cardBody: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  fieldContainer: {
    marginBottom: spacing.sm,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  label: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.textPrimary,
    marginRight: spacing.sm,
  },
  charCount: {
    ...typography.caption,
    color: colors.textSecondary,
    marginLeft: 'auto',
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
    height: 44,
    color: colors.textPrimary,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  themeWrap: {
    marginBottom: spacing.xs,
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  resetButtonText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.textSecondary,
  },
});
