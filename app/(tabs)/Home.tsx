import React, { useCallback, useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar, Alert, Animated, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Config } from '../../constants/Config';
import { colors, spacing, borderRadius, typography, shadows } from '../../constants/Theme';
import { AuthService } from '../../services/AuthService';
import { ActivityService } from '../../services/ActivityService';
import { ProfileMenu } from '../../components/ProfileMenu';
import type { RootStackParamList } from '../_layout';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface AppTile {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  color: string;
  iconName: keyof typeof Ionicons.glyphMap;
  isActive: boolean;
  onPress?: () => void;
}

type HomeScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Home'>;

/**
 * Home Page Component - Launchpad
 * Simple grid of app tiles with animated detail views
 */
export default function Home() {
  const navigation = useNavigation<HomeScreenNavigationProp>();
  const [profileMenuVisible, setProfileMenuVisible] = useState(false);
  const [isSigmaEmployee, setIsSigmaEmployee] = useState(false);
  
  // State for selected tile
  const [selectedTile, setSelectedTile] = useState<AppTile | null>(null);
  
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
      title: 'My Buys', 
      subtitle: 'Custom Embeds', 
      description: 'Create and manage your own custom Sigma workbook embeds. Build personalized dashboards tailored to your needs.',
      color: colors.tileColors.orange1,
      iconName: 'layers-outline',
      isActive: true,
      onPress: handleNavigateToMyBuys,
    },
    { 
      id: 'sigmanauts', 
      title: 'Sigmanauts', 
      subtitle: 'Sigma Tools', 
      description: 'Access Sigma employee tools and resources. Available only for @sigmacomputing.com email addresses.',
      color: colors.tileColors.orange1,
      iconName: 'people-outline',
      isActive: isSigmaEmployee,
      onPress: isSigmaEmployee ? handleNavigateToSigmanauts : undefined,
    },
    { 
      id: 'ai', 
      title: 'AI', 
      subtitle: 'AI Tools', 
      description: 'Access AI-powered tools and assistants. Chat with AI, query data, read newsletters, and get intelligent insights.',
      color: colors.tileColors.orange1,
      iconName: 'sparkles-outline',
      isActive: true,
      onPress: handleNavigateToAI,
    },
    { 
      id: 'dashboards', 
      title: 'Dashboards', 
      subtitle: 'Data Views', 
      description: 'View executive dashboards and data visualizations. Get insights on the go with real-time data.',
      color: colors.tileColors.orange1,
      iconName: 'bar-chart-outline',
      isActive: true,
      onPress: handleNavigateToDashboards,
    },
    { 
      id: 'apps', 
      title: 'Apps', 
      subtitle: 'Applications', 
      description: 'Access workflow and operations applications. Streamline your work with powerful tools.',
      color: colors.tileColors.orange1,
      iconName: 'apps-outline',
      isActive: true,
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

  const handleTilePress = (tile: AppTile) => {
    // If tile is active and has onPress handler, navigate directly
    if (tile.isActive && tile.onPress) {
      tile.onPress();
    } else {
      // Otherwise, show description modal
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
          <View style={[styles.detailIconContainer, { backgroundColor: selectedTile.color }]}>
            <Ionicons name={selectedTile.iconName} size={64} color="#FFFFFF" />
          </View>

          {/* Title */}
          <Text style={styles.detailTitle}>{selectedTile.title}</Text>
          <Text style={styles.detailSubtitle}>{selectedTile.subtitle}</Text>

          {/* Description */}
          <Text style={styles.detailDescription}>{selectedTile.description}</Text>

          {/* Launch button */}
          <TouchableOpacity
            style={[
              styles.launchButton,
              { 
                backgroundColor: selectedTile.isActive ? selectedTile.color : colors.border,
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
        </View>
      </Animated.View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTopBorder} />
        <View style={styles.headerContent}>
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle}>{Config.APP_NAME}</Text>
            <Text style={styles.headerSubtitle}>Welcome back</Text>
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
            {appTiles.map((tile) => (
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
                <View style={[styles.tile, { opacity: tile.isActive ? 1 : 0.4 }]}>
                  {/* Color accent bar */}
                  <View style={[styles.tileAccent, { backgroundColor: tile.color }]} />
                  
                  {/* Tile content */}
                  <View style={styles.tileContent}>
                    {/* Icon */}
                    <View style={[styles.iconContainer, { backgroundColor: tile.color + '20' }]}>
                      <Ionicons name={tile.iconName} size={24} color={tile.color} />
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
            ))}
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
  headerTopBorder: {
    height: 4,
    backgroundColor: colors.primary,
  },
  headerContent: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTextContainer: {
    flex: 1,
  },
  headerTitle: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  headerSubtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.xs,
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
});
