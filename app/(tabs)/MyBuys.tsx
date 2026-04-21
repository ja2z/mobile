import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Image,
  DeviceEventEmitter,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect, useRoute } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, spacing, borderRadius, typography, shadows } from '../../constants/Theme';
import { getAppletAccentColor, appletAccentMutedBackground } from '../../constants/AppletThemes';
import { MY_BUYS_APPLETS_CHANGED, type MyBuysAppletsChangedPayload } from '../../constants/MyBuysEvents';
import { MyBuysService } from '../../services/MyBuysService';
import {
  clearCardHeroSourceForRoute,
  setCardHeroSourceForRoute,
} from '../../constants/CardHeroTransition';
import type { Applet } from '../../types/mybuys.types';
import type { RootStackParamList } from '../_layout';

type MyBuysScreenNavigationProp = StackNavigationProp<RootStackParamList, 'MyBuys'>;

/**
 * My Apps Page Component
 * Displays user's custom applets in a grid layout
 */
export default function MyBuys() {
  const navigation = useNavigation<MyBuysScreenNavigationProp>();
  const route = useRoute();
  const [applets, setApplets] = useState<Applet[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [hiddenHeroTileId, setHiddenHeroTileId] = useState<string | null>(null);
  const tileInnerRefs = useRef<Map<string, View>>(new Map());

  // Re-reveal hero source tile when this screen regains focus after the
  // ViewMyBuysApplet destination is popped.
  useFocusEffect(
    useCallback(() => {
      setHiddenHeroTileId(null);
    }, []),
  );

  useEffect(() => {
    return () => {
      clearCardHeroSourceForRoute(route.name);
    };
  }, [route.name]);

  /**
   * Load applets from API
   */
  const loadApplets = useCallback(async () => {
    try {
      const data = await MyBuysService.listApplets();
      setApplets(data);
    } catch (error: any) {
      console.error('Failed to load applets:', error);
      if (error.isSessionExpired) {
        navigation.reset({ index: 0, routes: [{ name: 'Login' as const }] });
        return;
      }
      if (error.isExpirationError) {
        Alert.alert('Account Expired', error.message || 'Your account has expired.', [{
          text: 'OK',
          onPress: () => navigation.reset({ index: 0, routes: [{ name: 'Login' as const }] }),
        }]);
        return;
      }
      const errorMessage = error instanceof Error ? error.message : 'Failed to load applets';
      Alert.alert('Error', errorMessage);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  /**
   * When another screen saves/creates/deletes an applet, immediately patch local state
   * (bypasses AsyncStorage timing) then do a background refetch for full consistency.
   */
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(
      MY_BUYS_APPLETS_CHANGED,
      (payload?: MyBuysAppletsChangedPayload) => {
        if (payload?.action === 'updated' && payload.themeId) {
          setApplets((prev) =>
            prev.map((a) => {
              if (a.appletId !== payload.appletId) return a;
              const { themeCustomHex: _drop, ...rest } = a;
              if (payload.themeId === 'custom' && payload.themeCustomHex) {
                return { ...rest, themeId: payload.themeId, themeCustomHex: payload.themeCustomHex };
              }
              return { ...rest, themeId: payload.themeId };
            }),
          );
        } else if (payload?.action === 'deleted') {
          setApplets((prev) => prev.filter((a) => a.appletId !== payload.appletId));
        }
        // Skip the reconciling refetch for live color-picker updates: the PUT
        // to /color is still in flight, so refetching here would read stale
        // server state and clobber the optimistic patch above. The focus
        // effect will reconcile when the user navigates back.
        if (!payload?.liveThemeOnly) {
          loadApplets();
        }
      },
    );
    return () => sub.remove();
  }, [loadApplets]);

  /**
   * Refresh applets on screen focus
   */
  useFocusEffect(
    useCallback(() => {
      loadApplets();
    }, [loadApplets])
  );

  /**
   * Handle pull to refresh
   */
  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadApplets();
  }, [loadApplets]);

  /**
   * Handle applet press - measure the tapped card, publish a hero source
   * so the root overlay can morph it into the embed screen, then navigate.
   */
  const handleAppletPress = useCallback((applet: Applet, accent: string, iconBg: string) => {
    const doNavigate = () =>
      navigation.navigate('ViewMyBuysApplet' as never, { appletId: applet.appletId } as never);

    const node = tileInnerRefs.current.get(applet.appletId);
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
      setCardHeroSourceForRoute('ViewMyBuysApplet', {
        rect: { x, y, width, height },
        cornerRadius: borderRadius.md,
        tileBg: colors.background,
        accentColor: accent,
        accentBarHeight: 6,
        // ViewMyBuysApplet uses the primary header color.
        landingColor: colors.primary,
        title: applet.name,
        subtitle: applet.secretName || undefined,
        iconName:
          (applet.iconName as keyof typeof Ionicons.glyphMap) ||
          'layers-outline',
        iconColor: colors.primary,
        iconBgColor: iconBg,
        iconSize: 24,
        variant: 'L2',
      });
      setHiddenHeroTileId(applet.appletId);
      doNavigate();
    });
  }, [navigation]);

  /**
   * Open applet settings (modal) — explicit control from card
   */
  const handleAppletEdit = useCallback((applet: Applet) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      /* haptics optional */
    }
    navigation.navigate('EditMyBuysApplet' as never, { appletId: applet.appletId } as never);
  }, [navigation]);

  /**
   * Handle add button press
   */
  const handleAddPress = useCallback(() => {
    navigation.navigate('AddMyBuysApplet' as never);
  }, [navigation]);

  /**
   * Handle home button press
   * Uses goBack() to animate in the opposite direction (back animation)
   */
  const handleHomePress = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      // Fallback: navigate to Home if we can't go back (shouldn't happen in normal flow)
      navigation.navigate('Home' as never);
    }
  }, [navigation]);

  /**
   * Set up navigation header with back button
   */
  useEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity
          onPress={handleHomePress}
          style={styles.headerButton}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, handleHomePress]);

  /**
   * Render applet tile
   */
  const renderAppletTile = (applet: Applet) => {
    // Get org name from secretName or extract from URL
    const orgName = applet.secretName || MyBuysService.extractSecretNameFromUrl(applet.embedUrl) || 'Custom Embed';
    const accent = getAppletAccentColor(applet.themeId, applet.themeCustomHex);
    const iconBg = appletAccentMutedBackground(accent);
    const isHiddenForHero = hiddenHeroTileId === applet.appletId;

    return (
      <View key={applet.appletId} style={styles.tileButton}>
        <View
          ref={(node) => {
            if (node) tileInnerRefs.current.set(applet.appletId, node);
            else tileInnerRefs.current.delete(applet.appletId);
          }}
          style={[styles.tile, isHiddenForHero && styles.tileHidden]}
        >
          <TouchableOpacity
            style={styles.tileMainPress}
            onPress={() => handleAppletPress(applet, accent, iconBg)}
            activeOpacity={0.7}
            accessibilityLabel={`Open ${applet.name}`}
            accessibilityRole="button"
          >
            {/* RN often measures Text too narrow inside TouchableOpacity; inner View fixes full-tile width */}
            <View style={styles.tileMainInner}>
              <View style={[styles.tileAccent, { backgroundColor: accent }]} />
              <View style={styles.tileContent}>
                <View style={[styles.iconContainer, { backgroundColor: iconBg }]}>
                  <Ionicons
                    name={
                      (applet.iconName as keyof typeof Ionicons.glyphMap) ||
                      'layers-outline'
                    }
                    size={24}
                    color={colors.primary}
                  />
                </View>
                <View style={styles.tileTextContainer}>
                  <Text style={styles.tileTitle} numberOfLines={2} ellipsizeMode="tail">
                    {applet.name}
                  </Text>
                  <Text style={styles.tileSubtitle} numberOfLines={1} ellipsizeMode="tail">
                    {orgName}
                  </Text>
                </View>
              </View>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.tileEditButton}
            onPress={() => handleAppletEdit(applet)}
            activeOpacity={0.75}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
            accessibilityLabel={`Settings for ${applet.name}`}
            accessibilityRole="button"
          >
            <Image
              source={require('../../assets/pencil-edit.png')}
              style={styles.tileEditPencilImage}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  /**
   * Render add button tile
   */
  const renderAddTile = () => {
    return (
      <TouchableOpacity
        style={styles.tileButton}
        onPress={handleAddPress}
        activeOpacity={0.7}
        accessibilityLabel="Add new applet"
        accessibilityRole="button"
      >
        <View style={[styles.tile, styles.addTile]}>
          <View style={styles.addTileContent}>
            <View style={styles.addIconContainer}>
              <Ionicons name="add" size={32} color={colors.primary} />
            </View>
            <Text style={styles.addTileText}>Add Applet</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <StatusBar barStyle="dark-content" />

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accentBlue} />
          <Text style={styles.loadingText}>Loading applets...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.accentBlue}
            />
          }
        >
          {applets.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="layers-outline" size={64} color={colors.textSecondary} style={styles.emptyIcon} />
              <Text style={styles.emptyTitle}>No applets yet</Text>
              <Text style={styles.emptyMessage}>Create your first custom applet</Text>
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={handleAddPress}
                activeOpacity={0.7}
              >
                <Text style={styles.emptyButtonText}>Add Your First Applet</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.grid}>
              {applets.map(renderAppletTile)}
              {applets.length < 50 && renderAddTile()}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  headerButton: {
    padding: spacing.sm,
    marginLeft: spacing.sm,
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
  tileMainPress: {
    flex: 1,
    alignSelf: 'stretch',
    width: '100%',
  },
  tileMainInner: {
    flex: 1,
    width: '100%',
    minWidth: 0,
    minHeight: 0,
  },
  tileAccent: {
    height: 6,
  },
  tileContent: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'stretch',
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md,
    justifyContent: 'space-between',
  },
  tileEditButton: {
    position: 'absolute',
    // Below prior position; inset more from right edge = reads farther left
    top: 6 + spacing.md + spacing.xs,
    right: spacing.sm,
    zIndex: 2,
  },
  /** Transparent PNG — no chip; explicit transparency for RN compositing */
  tileEditPencilImage: {
    width: 36,
    height: 36,
    backgroundColor: 'transparent',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm + 36,
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
  addTile: {
    borderStyle: 'dashed',
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  addTileContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addIconContainer: {
    marginBottom: spacing.sm,
  },
  addTileText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.lg,
  },
  emptyIcon: {
    opacity: 0.5,
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  emptyMessage: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  emptyButton: {
    backgroundColor: colors.accentBlue,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    ...shadows.small,
  },
  emptyButtonText: {
    ...typography.body,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

