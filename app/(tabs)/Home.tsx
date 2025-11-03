import React, { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { Config } from '../../constants/Config';
import { colors, spacing, borderRadius, typography, shadows } from '../../constants/Theme';
import { AuthService } from '../../services/AuthService';
import type { RootStackParamList } from '../_layout';

interface AppTile {
  id: string;
  title: string;
  subtitle: string;
  color: string;
  iconName: keyof typeof Ionicons.glyphMap;
  isActive: boolean;
  onPress?: () => void;
}

type HomeScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Home'>;

/**
 * Home Page Component - Launchpad
 * Simple grid of app tiles
 */
export default function Home() {
  const navigation = useNavigation<HomeScreenNavigationProp>();

  const handleNavigateToDashboard = () => {
    navigation.navigate('Dashboard' as never);
  };

  const handleNavigateToAINewsletter = () => {
    navigation.navigate('AINewsletter' as never);
  };

  const appTiles: AppTile[] = [
    { 
      id: '1', 
      title: 'Data Dashboard', 
      subtitle: 'Analytics', 
      color: colors.tileColors.orange1,
      iconName: 'bar-chart-outline',
      isActive: false,
    },
    { 
      id: '2', 
      title: 'AOP Exec Dashboard', 
      subtitle: 'Executive View', 
      color: colors.tileColors.orange2,
      iconName: 'briefcase-outline',
      isActive: true,
      onPress: handleNavigateToDashboard,
    },
    { 
      id: '3', 
      title: 'AI Newsletter', 
      subtitle: 'Content', 
      color: colors.tileColors.orange3,
      iconName: 'sparkles-outline',
      isActive: true,
      onPress: handleNavigateToAINewsletter,
    },
    { 
      id: '4', 
      title: 'Report Builder', 
      subtitle: 'Reports', 
      color: colors.tileColors.orange4,
      iconName: 'document-text-outline',
      isActive: false,
    },
    { 
      id: '5', 
      title: 'Team Analytics', 
      subtitle: 'Performance', 
      color: colors.tileColors.orange1,
      iconName: 'people-outline',
      isActive: false,
    },
    { 
      id: '6', 
      title: 'Finance Hub', 
      subtitle: 'Budget', 
      color: colors.tileColors.orange2,
      iconName: 'cash-outline',
      isActive: false,
    },
    { 
      id: '7', 
      title: 'Operations', 
      subtitle: 'Workflow', 
      color: colors.tileColors.orange3,
      iconName: 'git-network-outline',
      isActive: false,
    },
    { 
      id: '8', 
      title: 'Settings', 
      subtitle: 'Configure', 
      color: colors.tileColors.orange4,
      iconName: 'settings-outline',
      isActive: false,
    },
  ];

  /**
   * Handle logout - clear session and navigate to Login
   */
  const handleLogout = useCallback(async () => {
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

  const handleTilePress = (tile: AppTile) => {
    if (tile.onPress) {
      tile.onPress();
    }
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
          <TouchableOpacity
            onPress={handleLogout}
            style={styles.logoutButton}
            activeOpacity={0.7}
            accessibilityLabel="Sign out"
            accessibilityHint="Signs you out and returns to the login screen"
          >
            <Ionicons name="log-out-outline" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* App Grid */}
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
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
  logoutButton: {
    padding: spacing.sm,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: spacing.md,
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
});
