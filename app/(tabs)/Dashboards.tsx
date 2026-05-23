import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar, ActivityIndicator, Platform, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, spacing, borderRadius, typography, shadows } from '../../constants/Theme';
import { appletAccentMutedBackground } from '../../constants/AppletThemes';
import { useAppletHeader } from '../../hooks/useAppletHeader';
import {
  getCachedBuiltInAppletsSync,
  listBuiltInApplets,
  type BuiltInApplet,
} from '../../services/BuiltInAppletsService';
import {
  clearCardHeroSourceForRoute,
  setCardHeroSourceForRoute,
} from '../../constants/CardHeroTransition';
import type { RootStackParamList } from '../_layout';

type DashboardsScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Dashboards'>;

const LIST_SCREEN = 'Dashboards';
const SPINNER_DELAY_MS = 200;

/**
 * Dashboards Page Component
 * Displays dashboard applets in a grid layout (fetched from API)
 */
export default function Dashboards() {
  const navigation = useNavigation<DashboardsScreenNavigationProp>();
  const route = useRoute();
  /**
   * Seed the grid synchronously from the module-level cache (warmed by
   * Home's `prefetchBuiltInApplets` on mount). When the cache is populated,
   * tiles render on first paint so they're visible inside the hero
   * transition's growing window. When the cache is cold we fall back to
   * the existing fetch path and spinner.
   */
  const cachedOnMount = getCachedBuiltInAppletsSync();
  const [applets, setApplets] = useState<BuiltInApplet[]>(
    cachedOnMount ? cachedOnMount.filter((a) => a.list_screen === LIST_SCREEN) : [],
  );
  const [loading, setLoading] = useState(cachedOnMount === null);
  const [showSpinner, setShowSpinner] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const spinnerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const all = await listBuiltInApplets({ forceRefresh: true });
      setApplets(all.filter((a) => a.list_screen === LIST_SCREEN));
    } catch (err) {
      console.error('Failed to refresh applets:', err);
    } finally {
      setRefreshing(false);
    }
  }, []);

  const [hiddenHeroTileId, setHiddenHeroTileId] = useState<string | null>(null);
  const tileInnerRefs = useRef<Map<string, View>>(new Map());

  // Re-reveal hero source tile when this screen regains focus after a
  // destination (applet embed) is popped off the stack.
  useFocusEffect(
    useCallback(() => {
      setHiddenHeroTileId(null);
    }, []),
  );

  // Clear this screen's own hero source on unmount.
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

  useAppletHeader(navigation, handleHomePress, colors.background, colors.textPrimary);

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
        color: applet.color ?? undefined,
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
          landingColor: applet.color || colors.primary,
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
    const accent = applet.color || colors.accentBlue;
    const displayName = applet.name;
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
      <StatusBar barStyle="dark-content" />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accentBlue}
          />
        }
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

