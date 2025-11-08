import React, { useCallback, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar, Alert, Animated, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { Config } from '../../constants/Config';
import { colors, spacing, borderRadius, typography, shadows } from '../../constants/Theme';
import { AuthService } from '../../services/AuthService';
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
  
  // State for selected tile
  const [selectedTile, setSelectedTile] = useState<AppTile | null>(null);
  
  // Animation values
  const detailViewOpacity = useRef(new Animated.Value(0)).current;
  const detailViewScale = useRef(new Animated.Value(0.8)).current;
  const gridOpacity = useRef(new Animated.Value(1)).current;

  const handleNavigateToDashboard = () => {
    navigation.navigate('Dashboard' as never);
  };

  const handleNavigateToAINewsletter = () => {
    navigation.navigate('AINewsletter' as never);
  };

  const handleNavigateToConversationalAI = () => {
    navigation.navigate('ConversationalAI' as never);
  };

  const appTiles: AppTile[] = [
    { 
      id: '1', 
      title: 'Data Dashboard', 
      subtitle: 'Analytics', 
      description: 'Comprehensive analytics and data visualization tools to help you understand your metrics at a glance.',
      color: colors.tileColors.orange1,
      iconName: 'bar-chart-outline',
      isActive: false,
    },
    { 
      id: '2', 
      title: 'AOP Exec Dashboard', 
      subtitle: 'Executive View', 
      description: 'Beautiful dashboard for executives to gain quick insights on the go. Stay informed with real-time data.',
      color: colors.tileColors.orange2,
      iconName: 'briefcase-outline',
      isActive: true,
      onPress: handleNavigateToDashboard,
    },
    { 
      id: '3', 
      title: 'AI Newsletter', 
      subtitle: 'Content', 
      description: 'Stay updated with AI-generated content and insights. Get the latest news curated just for you.',
      color: colors.tileColors.orange3,
      iconName: 'sparkles-outline',
      isActive: true,
      onPress: handleNavigateToAINewsletter,
    },
    { 
      id: '4', 
      title: 'Report Builder', 
      subtitle: 'Reports', 
      description: 'Create custom reports and export data with our powerful report building tools. Coming soon.',
      color: colors.tileColors.orange4,
      iconName: 'document-text-outline',
      isActive: false,
    },
    { 
      id: '5', 
      title: 'Conversational AI', 
      subtitle: 'AI Assistant', 
      description: 'Interact with your data using natural language. Ask questions and get instant insights powered by AI.',
      color: colors.tileColors.orange1,
      iconName: 'chatbubbles-outline',
      isActive: true,
      onPress: handleNavigateToConversationalAI,
    },
    { 
      id: '6', 
      title: 'Finance Hub', 
      subtitle: 'Budget', 
      description: 'Manage budgets, track expenses, and get financial insights all in one convenient location.',
      color: colors.tileColors.orange2,
      iconName: 'cash-outline',
      isActive: false,
    },
    { 
      id: '7', 
      title: 'Operations', 
      subtitle: 'Workflow', 
      description: 'Streamline your operations workflow with powerful automation and monitoring capabilities.',
      color: colors.tileColors.orange3,
      iconName: 'git-network-outline',
      isActive: false,
    },
    { 
      id: '8', 
      title: 'Settings', 
      subtitle: 'Configure', 
      description: 'Customize your app experience and manage your preferences from this central settings hub.',
      color: colors.tileColors.orange4,
      iconName: 'settings-outline',
      isActive: false,
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
    expandTile(tile);
  };

  const handleLaunchPress = () => {
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
                activeOpacity={0.7}
                accessibilityLabel={`${tile.title} - ${tile.subtitle}`}
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
