import React, { useCallback, useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar, Alert, Animated, Dimensions, Image, Modal } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Config } from '../../constants/Config';
import { colors, spacing, borderRadius, typography, shadows } from '../../constants/Theme';
import { appletAccentMutedBackground } from '../../constants/AppletThemes';
import { AuthService } from '../../services/AuthService';
import { ActivityService } from '../../services/ActivityService';
import { ProfileMenu } from '../../components/ProfileMenu';
import type { RootStackParamList } from '../_layout';
import { setCardHeroSourceForRoute } from '../../constants/CardHeroTransition';
import { prefetchBuiltInApplets } from '../../services/BuiltInAppletsService';
import { useFocusEffect } from '@react-navigation/native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface AppTile {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  iconName: keyof typeof Ionicons.glyphMap;
  isActive: boolean;
  /** Color the hero overlay settles into (matches destination header). */
  landingColor: string;
  /**
   * Destination route name used to key the hero source in the per-route
   * bus. When present, pressing the tile publishes a source for this route
   * so the destination's `cardStyleInterpolator` can scale in from the
   * tile's rect.
   */
  routeName?: keyof RootStackParamList;
  onPress?: () => void;
}

type HomeScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Home'>;

/**
 * Home Page Component - Launchpad
 * Simple grid of app tiles with animated detail views
 */
export default function Home() {
  const navigation = useNavigation<HomeScreenNavigationProp>();
  const insets = useSafeAreaInsets();
  const [profileMenuVisible, setProfileMenuVisible] = useState(false);
  const [isSigmaEmployee, setIsSigmaEmployee] = useState(false);
  const [phoneNudgeVisible, setPhoneNudgeVisible] = useState(false);

  // State for selected tile
  const [selectedTile, setSelectedTile] = useState<AppTile | null>(null);

  /**
   * ID of the tile that's currently the source of an in-flight hero
   * transition. Its rendered opacity drops to 0 while the destination
   * scales in over the same rect so we don't see a "ghost" card behind
   * the shrinking destination on back. Cleared when Home regains focus
   * (after the destination is popped).
   */
  const [hiddenHeroTileId, setHiddenHeroTileId] = useState<string | null>(null);

  const tileInnerRefs = useRef<Map<string, View>>(new Map());

  /**
   * Re-reveal the source tile when Home regains focus (the destination
   * has been popped off the stack). While Home is blurred (a destination
   * sits on top), we intentionally leave the tile hidden so the back
   * transition shrinks a full-size card back onto an empty slot rather
   * than an already-visible duplicate.
   */
  useFocusEffect(
    useCallback(() => {
      setHiddenHeroTileId(null);
    }, []),
  );
  
  // Animation values
  const detailViewOpacity = useRef(new Animated.Value(0)).current;
  const detailViewScale = useRef(new Animated.Value(0.8)).current;
  const gridOpacity = useRef(new Animated.Value(1)).current;

  /**
   * Check if user is a Sigma employee based on email domain
   */
  useEffect(() => {
    const checkEmailDomain = async () => {
      try {
        const session = await AuthService.getSession();
        if (session?.user?.email) {
          const isSigma = session.user.email.toLowerCase().endsWith('@sigmacomputing.com');
          setIsSigmaEmployee(isSigma);
        }
      } catch (error) {
        console.error('Error checking email domain:', error);
        setIsSigmaEmployee(false);
      }
    };

    checkEmailDomain();
  }, []);

  /**
   * Warm the built-in applet cache so folder screens (Apps / AI / Dashboards
   * / Sigmanauts) can render their grid from cache on first paint instead
   * of waiting for a network fetch after the hero transition settles.
   */
  useEffect(() => {
    prefetchBuiltInApplets();
  }, []);

  // Post-login phone nudge: show once per login instance if no verified phone and not backdoor
  useEffect(() => {
    const checkPhoneNudge = async () => {
      try {
        const session = await AuthService.getSession();
        if (!session) return;

        // Decode JWT to check isBackdoor flag — never show nudge for backdoor sessions
        const decoded = AuthService.decodeJWT(session.jwt);
        if (decoded?.isBackdoor) return;

        const shouldShow = await AuthService.shouldShowPhoneNudge();
        if (!shouldShow) return;

        const profile = await AuthService.getMe();
        if (!profile?.phoneNumber) {
          setPhoneNudgeVisible(true);
        }
      } catch (error) {
        console.error('[Home] Error checking phone nudge:', error);
      }
    };

    checkPhoneNudge();
  }, []);

  const handleNavigateToMyBuys = () => {
    navigation.navigate('MyBuys' as never);
  };

  const handleNavigateToSigmanauts = () => {
    navigation.navigate('Sigmanauts' as never);
  };

  const handleNavigateToAI = () => {
    navigation.navigate('AI' as never);
  };

  const handleNavigateToDashboards = () => {
    navigation.navigate('Dashboards' as never);
  };

  const handleNavigateToApps = () => {
    navigation.navigate('Apps' as never);
  };

  const appTiles: AppTile[] = [
    { 
      id: '9', 
      title: 'My Apps', 
      subtitle: 'Custom Embeds', 
      description: 'Create and manage your own custom Sigma workbook embeds. Build personalized dashboards tailored to your needs.',
      iconName: 'layers-outline',
      isActive: true,
      landingColor: colors.background,
      routeName: 'MyBuys',
      onPress: handleNavigateToMyBuys,
    },
    { 
      id: 'sigmanauts', 
      title: 'Sigmanauts', 
      subtitle: 'Sigma Tools', 
      description: 'Access Sigma employee tools and resources. Available only for @sigmacomputing.com email addresses.',
      iconName: 'people-outline',
      isActive: true,
      landingColor: colors.background,
      routeName: 'Sigmanauts',
      onPress: isSigmaEmployee ? handleNavigateToSigmanauts : undefined,
    },
    { 
      id: 'ai', 
      title: 'AI', 
      subtitle: 'AI Tools', 
      description: 'Access AI-powered tools and assistants. Chat with AI, query data, read newsletters, and get intelligent insights.',
      iconName: 'sparkles-outline',
      isActive: true,
      landingColor: colors.background,
      routeName: 'AI',
      onPress: handleNavigateToAI,
    },
    { 
      id: 'dashboards', 
      title: 'Dashboards', 
      subtitle: 'Data Views', 
      description: 'View executive dashboards and data visualizations. Get insights on the go with real-time data.',
      iconName: 'bar-chart-outline',
      isActive: true,
      landingColor: colors.background,
      routeName: 'Dashboards',
      onPress: handleNavigateToDashboards,
    },
    { 
      id: 'apps', 
      title: 'Apps', 
      subtitle: 'Applications', 
      description: 'Access workflow and operations applications. Streamline your work with powerful tools.',
      iconName: 'apps-outline',
      isActive: true,
      landingColor: colors.background,
      routeName: 'Apps',
      onPress: handleNavigateToApps,
    },
  ];

  /**
   * Handle logout - clear session and navigate to Login
   */
  const handleLogout = useCallback(async () => {
    // Close profile menu first
    setProfileMenuVisible(false);
    
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              // Clear authentication session (removes JWT and user data from SecureStore)
              await AuthService.clearSession();
              console.log('✅ User logged out successfully');
              
              // Reset navigation stack to Login screen (prevents going back)
              navigation.reset({
                index: 0,
                routes: [{ name: 'Login' }],
              });
            } catch (error) {
              console.error('❌ Logout error:', error);
              Alert.alert('Error', 'Failed to sign out. Please try again.');
            }
          },
        },
      ],
      { cancelable: true }
    );
  }, [navigation]);

  // Animation functions
  const expandTile = (tile: AppTile) => {
    setSelectedTile(tile);
    
    Animated.parallel([
      Animated.timing(detailViewOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.spring(detailViewScale, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.timing(gridOpacity, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const collapseTile = () => {
    Animated.parallel([
      Animated.timing(detailViewOpacity, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(detailViewScale, {
        toValue: 0.8,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(gridOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setSelectedTile(null);
    });
  };

  /**
   * Measure the tapped tile in window coords, publish a `CardHeroSource`
   * for the destination route so that route's `cardStyleInterpolator` can
   * scale the destination card in from the tile's rect, hide the source
   * tile for the duration of the transition, then navigate. Falls back to
   * a plain navigate if the tile isn't measurable or has no routeName.
   */
  const triggerHeroNavigate = (tile: AppTile) => {
    const node = tileInnerRefs.current.get(tile.id);
    if (!node || !tile.onPress || !tile.routeName) {
      tile.onPress?.();
      return;
    }
    const routeName = tile.routeName;
    node.measureInWindow((x, y, width, height) => {
      if (!width || !height) {
        tile.onPress?.();
        return;
      }
      setCardHeroSourceForRoute(routeName, {
        rect: { x, y, width, height },
        cornerRadius: borderRadius.md,
        tileBg: colors.background,
        accentColor: colors.accentBlue,
        accentBarHeight: 6,
        landingColor: tile.landingColor,
        title: tile.title,
        subtitle: tile.subtitle,
        iconName: tile.iconName,
        iconColor: colors.primary,
        iconBgColor: appletAccentMutedBackground(colors.accentBlue, 0.18),
        iconSize: 24,
        variant: 'L1',
      });
      setHiddenHeroTileId(tile.id);
      tile.onPress?.();
    });
  };

  const handleTilePress = (tile: AppTile) => {
    // If tile is active and has onPress handler, trigger the hero transition.
    if (tile.isActive && tile.onPress) {
      try {
        Haptics.selectionAsync();
      } catch {
        // Haptics unavailable; proceed silently.
      }
      triggerHeroNavigate(tile);
    } else {
      // Otherwise, show description modal.
      expandTile(tile);
    }
  };

  const handleTileLongPress = (tile: AppTile) => {
    // Provide haptic feedback to confirm long press
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (error) {
      // Haptics not available on this device, silently continue
    }
    // Show description modal on long press
    expandTile(tile);
  };

  const handleLaunchPress = async () => {
    if (selectedTile && selectedTile.onPress) {
      collapseTile();
      
      // Delay navigation to allow animation to complete
      setTimeout(() => {
        selectedTile.onPress?.();
      }, 300);
    }
  };

  // Render detail view for selected tile
  const renderDetailView = () => {
    if (!selectedTile) return null;

    return (
      <Animated.View 
        style={[
          styles.detailViewContainer,
          {
            opacity: detailViewOpacity,
            transform: [{ scale: detailViewScale }],
          },
        ]}
      >
        <View style={styles.detailView}>
          {/* Close button */}
          <TouchableOpacity 
            style={styles.closeButton}
            onPress={collapseTile}
            activeOpacity={0.7}
            accessibilityLabel="Close detail view"
            accessibilityRole="button"
          >
            <Ionicons name="close" size={28} color={colors.textPrimary} />
          </TouchableOpacity>

          {/* Icon header */}
          <View style={[styles.detailIconContainer, { backgroundColor: appletAccentMutedBackground(colors.accentBlue, 0.22) }]}>
            {selectedTile.id === 'sigmanauts' ? (
              <Image
                source={require('../../assets/sigma-logo-symbol-black.png')}
                style={styles.sigmaLogoDetail}
                resizeMode="contain"
              />
            ) : (
              <Ionicons name={selectedTile.iconName} size={64} color={colors.primary} />
            )}
          </View>

          {/* Title */}
          <Text style={styles.detailTitle}>{selectedTile.title}</Text>
          <Text style={styles.detailSubtitle}>{selectedTile.subtitle}</Text>

          {/* Description */}
          <Text style={styles.detailDescription}>{selectedTile.description}</Text>

          {/* Launch button */}
          {selectedTile.id === 'sigmanauts' && !isSigmaEmployee ? null : (
            <TouchableOpacity
              style={[
                styles.launchButton,
                { 
                  backgroundColor: selectedTile.isActive ? colors.accentBlue : colors.border,
                  opacity: selectedTile.isActive ? 1 : 0.6,
                },
              ]}
              onPress={handleLaunchPress}
              disabled={!selectedTile.isActive}
              activeOpacity={0.8}
              accessibilityLabel={selectedTile.isActive ? `Launch ${selectedTile.title}` : 'Coming soon'}
              accessibilityRole="button"
            >
              <Text style={[
                styles.launchButtonText,
                { color: selectedTile.isActive ? '#FFFFFF' : colors.textSecondary }
              ]}>
                {selectedTile.isActive ? 'Launch' : 'Coming Soon'}
              </Text>
              {selectedTile.isActive && (
                <Ionicons name="arrow-forward" size={20} color="#FFFFFF" style={styles.launchIcon} />
              )}
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <StatusBar barStyle="dark-content" />
      
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <View style={styles.headerContent}>
          <View style={styles.headerTextContainer}>
            <Image
              source={require('../../assets/zeta_solid_purple_6B2A87_1024x1024_cropped_transparent.png')}
              style={styles.headerLogo}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
            <Text style={styles.headerTitle}>{Config.APP_NAME}</Text>
          </View>
          <View style={styles.headerButtons}>
            <TouchableOpacity
              onPress={() => setProfileMenuVisible(true)}
              style={styles.profileButton}
              activeOpacity={0.7}
              accessibilityLabel="Open profile menu"
              accessibilityHint="Opens profile menu with account information"
            >
              <Ionicons name="person-outline" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* App Grid */}
      <Animated.View style={[styles.gridContainer, { opacity: gridOpacity }]}>
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!selectedTile}
        >
          <View style={styles.grid}>
            {appTiles.map((tile) => {
              const isDim = tile.id === 'sigmanauts' && !isSigmaEmployee;
              const baseOpacity = isDim ? 0.4 : (tile.isActive ? 1 : 0.4);
              const isHiddenForHero = hiddenHeroTileId === tile.id;
              return (
                <TouchableOpacity
                  key={tile.id}
                  style={styles.tileButton}
                  onPress={() => handleTilePress(tile)}
                  onLongPress={() => handleTileLongPress(tile)}
                  activeOpacity={0.7}
                  accessibilityLabel={`${tile.title} - ${tile.subtitle}${tile.isActive && tile.onPress ? ' - Long press for description' : ''}`}
                  accessibilityRole="button"
                  disabled={!!selectedTile}
                >
                  <View
                    ref={(node) => {
                      if (node) tileInnerRefs.current.set(tile.id, node);
                      else tileInnerRefs.current.delete(tile.id);
                    }}
                    style={[
                      styles.tile,
                      { opacity: isHiddenForHero ? 0 : baseOpacity },
                    ]}
                  >
                    {/* Color accent bar */}
                    <View style={[styles.tileAccent, { backgroundColor: colors.accentBlue }]} />

                    {/* Tile content */}
                    <View style={styles.tileContent}>
                      {/* Icon */}
                      <View style={[styles.iconContainer, { backgroundColor: appletAccentMutedBackground(colors.accentBlue, 0.18) }]}>
                        {tile.id === 'sigmanauts' ? (
                          <Image
                            source={require('../../assets/sigma-logo-symbol-black.png')}
                            style={styles.sigmaLogo}
                            resizeMode="contain"
                          />
                        ) : (
                          <Ionicons name={tile.iconName} size={24} color={colors.primary} />
                        )}
                      </View>

                      {/* Text content */}
                      <View style={styles.tileTextContainer}>
                        <Text style={styles.tileTitle} numberOfLines={2}>
                          {tile.title}
                        </Text>
                        <Text style={styles.tileSubtitle} numberOfLines={1}>
                          {tile.subtitle}
                        </Text>
                        {!tile.isActive && (
                          <Text style={styles.comingSoon}>Coming Soon</Text>
                        )}
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      </Animated.View>

      {/* Detail View Overlay */}
      {renderDetailView()}

      {/* Profile Menu Modal */}
      <ProfileMenu
        visible={profileMenuVisible}
        onClose={() => setProfileMenuVisible(false)}
        onLogout={handleLogout}
      />

      {/* Phone verification nudge modal */}
      <Modal
        visible={phoneNudgeVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          AuthService.dismissPhoneNudge();
          setPhoneNudgeVisible(false);
        }}
      >
        <View style={styles.nudgeOverlay}>
          <View style={styles.nudgeCard}>
            <View style={styles.nudgeIconCircle}>
              <Ionicons name="phone-portrait-outline" size={32} color={colors.primary} />
            </View>
            <Text style={styles.nudgeTitle}>Verify Your Phone Number</Text>
            <Text style={styles.nudgeBody}>
              Add a verified phone number to receive SMS notifications directly from Sigma workbooks — right on your mobile device.
            </Text>
            <TouchableOpacity
              style={styles.nudgePrimaryButton}
              activeOpacity={0.8}
              onPress={() => {
                AuthService.dismissPhoneNudge();
                setPhoneNudgeVisible(false);
                navigation.navigate('PhoneVerification' as never);
              }}
            >
              <Text style={styles.nudgePrimaryButtonText}>Verify Now</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.nudgeSecondaryButton}
              onPress={() => {
                AuthService.dismissPhoneNudge();
                setPhoneNudgeVisible(false);
              }}
            >
              <Text style={styles.nudgeSecondaryButtonText}>Maybe Later</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  header: {
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerContent: {
    height: 44,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTextContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerLogo: {
    width: 28,
    height: 28,
    marginRight: spacing.sm,
  },
  headerTitle: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileButton: {
    padding: spacing.sm,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridContainer: {
    flex: 1,
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
  tileAccent: {
    height: 6,
  },
  tileContent: {
    flex: 1,
    padding: spacing.md,
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
  },
  tileTitle: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  tileSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  comingSoon: {
    ...typography.caption,
    fontSize: 11,
    color: '#FFFFFF',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
    marginTop: 6,
    fontWeight: '700',
    overflow: 'hidden',
    alignSelf: 'flex-start',
  },
  // Detail View Styles
  detailViewContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: spacing.lg,
  },
  detailView: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    ...shadows.medium,
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  closeButton: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    ...shadows.small,
  },
  detailIconContainer: {
    width: 120,
    height: 120,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: spacing.lg,
    marginTop: spacing.md,
  },
  detailTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  detailSubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  detailDescription: {
    ...typography.body,
    color: colors.textPrimary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: spacing.xl,
  },
  launchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.md,
    minHeight: 56,
    ...shadows.small,
  },
  launchButtonText: {
    ...typography.body,
    fontWeight: '700',
    fontSize: 18,
  },
  launchIcon: {
    marginLeft: spacing.sm,
  },
  sigmaLogo: {
    width: 24,
    height: 24,
    // Remove tintColor - display logo in original black color
    backgroundColor: 'transparent',
  },
  sigmaLogoDetail: {
    width: 64,
    height: 64,
    // Remove tintColor - display logo in original black color
  },
  // Phone nudge modal
  nudgeOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  nudgeCard: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    ...shadows.medium,
  },
  nudgeIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  nudgeTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  nudgeBody: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.xl,
  },
  nudgePrimaryButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    width: '100%',
    alignItems: 'center',
    marginBottom: spacing.sm,
    minHeight: 52,
    justifyContent: 'center',
  },
  nudgePrimaryButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  nudgeSecondaryButton: {
    paddingVertical: spacing.md,
    alignItems: 'center',
    width: '100%',
  },
  nudgeSecondaryButtonText: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
