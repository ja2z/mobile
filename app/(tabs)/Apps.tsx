import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar, ActivityIndicator, Platform, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, spacing, borderRadius, typography, shadows } from '../../constants/Theme';
import { appletAccentMutedBackground, getAppletAccentColor } from '../../constants/AppletThemes';
import { useAppletHeader } from '../../hooks/useAppletHeader';
import { useHubPersonalizations } from '../../hooks/useHubPersonalizations';
import { listBuiltInApplets, type BuiltInApplet } from '../../services/BuiltInAppletsService';
import {
  clearCardHeroSourceForRoute,
  setCardHeroSourceForRoute,
} from '../../constants/CardHeroTransition';
import type { RootStackParamList } from '../_layout';

type AppsScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Apps'>;

const LIST_SCREEN = 'Apps';
const SPINNER_DELAY_MS = 200;

/**
 * Apps Page Component
 * Displays app applets in a grid layout (fetched from API)
 */
export default function Apps() {
  const navigation = useNavigation<AppsScreenNavigationProp>();
  const route = useRoute();
  const [applets, setApplets] = useState<BuiltInApplet[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSpinner, setShowSpinner] = useState(false);
  const spinnerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * ID of the applet tile currently acting as the hero source (user tapped
   * it, a destination is pushed on top). Its rendered opacity drops to 0
   * while the destination sits over it so the back transition shrinks a
   * full card onto an empty slot instead of an already-visible duplicate.
   * Cleared when Apps regains focus after the destination is popped.
   */
  const [hiddenHeroTileId, setHiddenHeroTileId] = useState<string | null>(null);
  const tileInnerRefs = useRef<Map<string, View>>(new Map());

  useFocusEffect(
    useCallback(() => {
      setHiddenHeroTileId(null);
    }, []),
  );

  // Clear this screen's own hero source (published by Home) on unmount so
  // the bus doesn't hold a stale rect after Apps is popped.
  useEffect(() => {
    return () => {
      clearCardHeroSourceForRoute(route.name);
    };
  }, [route.name]);

  useEffect(() => {
    spinnerTimeoutRef.current = setTimeout(() => {
      setShowSpinner(true);
    }, SPINNER_DELAY_MS);

    return () => {
      if (spinnerTimeoutRef.current) clearTimeout(spinnerTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    listBuiltInApplets()
      .then((all) => setApplets(all.filter((a) => a.list_screen === LIST_SCREEN)))
      .catch((err) => console.error('Failed to fetch applets:', err))
      .finally(() => setLoading(false));
  }, []);

  const handleHomePress = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('Home' as never);
    }
  }, [navigation]);

  useAppletHeader(navigation, handleHomePress, colors.folderSections.apps);

  const { getOverride } = useHubPersonalizations();

  const handleEdit = useCallback(
    (applet: BuiltInApplet) => {
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
      const ov = getOverride(applet.applet_id);
      navigation.navigate('EditHubApplet', {
        itemId: applet.applet_id,
        currentName: ov?.displayName || applet.name,
        currentThemeId: ov?.themeId,
        currentThemeCustomHex: ov?.themeCustomHex,
      });
    },
    [navigation, getOverride],
  );

  const navigateToApplet = useCallback(
    (applet: BuiltInApplet, accent: string, displayName: string) => {
      const params = {
        appletId: applet.applet_id,
        appletName: applet.name,
        workbookId: applet.workbook_id ?? undefined,
        slug: applet.slug,
        embedPath: applet.embed_path,
        name: applet.name,
        pageId: applet.initial_page_id || undefined,
      };
      const screen = applet.target_screen === 'conversationalai' ? 'ConversationalAI' : applet.target_screen;
      const routeName = screen as keyof RootStackParamList;
      const doNavigate = () => navigation.navigate(routeName, params as never);

      const node = tileInnerRefs.current.get(applet.applet_id);
      if (!node) {
        doNavigate();
        return;
      }
      try { Haptics.selectionAsync(); } catch {}
      node.measureInWindow((x, y, width, height) => {
        if (!width || !height) {
          doNavigate();
          return;
        }
        setCardHeroSourceForRoute(routeName, {
          rect: { x, y, width, height },
          cornerRadius: borderRadius.md,
          tileBg: colors.background,
          accentColor: accent,
          accentBarHeight: 6,
          // Embed screens (Dashboard / ConversationalAI / Operations /
          // GenericAppletView) use `colors.primary` as their header bg.
          landingColor: colors.primary,
          title: displayName,
          subtitle: applet.subtitle || undefined,
          iconName: (applet.icon_name as keyof typeof Ionicons.glyphMap) || 'grid-outline',
          iconColor: colors.primary,
          iconBgColor: appletAccentMutedBackground(accent, 0.18),
          iconSize: 24,
          variant: 'L2',
        });
        setHiddenHeroTileId(applet.applet_id);
        doNavigate();
      });
    },
    [navigation]
  );

  const renderAppletTile = (applet: BuiltInApplet) => {
    const ov = getOverride(applet.applet_id);
    const accent = ov?.themeId
      ? getAppletAccentColor(ov.themeId, ov.themeCustomHex)
      : colors.accentBlue;
    const displayName = ov?.displayName || applet.name;
    const isHiddenForHero = hiddenHeroTileId === applet.applet_id;

    return (
      <TouchableOpacity
        key={applet.applet_id}
        style={styles.tileButton}
        onPress={() => navigateToApplet(applet, accent, displayName)}
        activeOpacity={0.7}
        accessibilityLabel={`${displayName} - ${applet.subtitle || ''}`}
        accessibilityRole="button"
      >
        <View
          ref={(node) => {
            if (node) tileInnerRefs.current.set(applet.applet_id, node);
            else tileInnerRefs.current.delete(applet.applet_id);
          }}
          style={[styles.tile, isHiddenForHero && styles.tileHidden]}
        >
          <View style={[styles.tileAccent, { backgroundColor: accent }]} />
          <TouchableOpacity
            style={styles.tileEditButton}
            onPress={() => handleEdit(applet)}
            activeOpacity={0.75}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
            accessibilityLabel={`Personalize ${displayName}`}
            accessibilityRole="button"
          >
            <Image
              source={require('../../assets/pencil-edit.png')}
              style={styles.tileEditPencilImage}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
          </TouchableOpacity>
          <View style={styles.tileContent}>
            <View style={[styles.iconContainer, { backgroundColor: appletAccentMutedBackground(accent, 0.18) }]}>
              <Ionicons name={(applet.icon_name as keyof typeof Ionicons.glyphMap) || 'grid-outline'} size={24} color={colors.primary} />
            </View>
            <View style={styles.tileTextContainer}>
              <Text style={styles.tileTitle} numberOfLines={2} ellipsizeMode="tail">
                {displayName}
              </Text>
              <Text style={styles.tileSubtitle} numberOfLines={1} ellipsizeMode="tail">
                {applet.subtitle || ''}
              </Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading && showSpinner) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accentBlue} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.grid}>
          {applets.map(renderAppletTile)}
        </View>
      </ScrollView>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  tileButton: {
    width: '48%',
    aspectRatio: 1,
    marginBottom: spacing.md,
  },
  tile: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadows.medium,
  },
  tileHidden: {
    opacity: 0,
  },
  tileAccent: {
    height: 6,
  },
  tileEditButton: {
    position: 'absolute',
    top: 6 + spacing.md + spacing.xs,
    right: spacing.sm,
    zIndex: 2,
  },
  tileEditPencilImage: {
    width: 36,
    height: 36,
    backgroundColor: 'transparent',
  },
  tileContent: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'stretch',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    justifyContent: 'space-between',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileTextContainer: {
    marginTop: spacing.xs,
    alignSelf: 'stretch',
    width: '100%',
    minWidth: 0,
  },
  tileTitle: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
    alignSelf: 'stretch',
    ...Platform.select({
      android: { textBreakStrategy: 'simple' as const },
    }),
  },
  tileSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
