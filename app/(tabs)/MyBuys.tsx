import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { Config } from '../../constants/Config';
import { colors, spacing, borderRadius, typography, shadows } from '../../constants/Theme';
import { MyBuysService } from '../../services/MyBuysService';
import type { Applet } from '../../types/mybuys.types';
import type { RootStackParamList } from '../_layout';

type MyBuysScreenNavigationProp = StackNavigationProp<RootStackParamList, 'MyBuys'>;

/**
 * My Buys Page Component
 * Displays user's custom applets in a grid layout
 */
export default function MyBuys() {
  const navigation = useNavigation<MyBuysScreenNavigationProp>();
  const [applets, setApplets] = useState<Applet[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  /**
   * Load applets from API
   */
  const loadApplets = useCallback(async () => {
    try {
      const data = await MyBuysService.listApplets();
      setApplets(data);
    } catch (error) {
      console.error('Failed to load applets:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to load applets';
      Alert.alert('Error', errorMessage);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

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
   * Handle applet press - navigate to view screen
   */
  const handleAppletPress = useCallback((applet: Applet) => {
    navigation.navigate('ViewMyBuysApplet' as never, { appletId: applet.appletId } as never);
  }, [navigation]);

  /**
   * Handle applet long press - navigate to edit screen
   */
  const handleAppletLongPress = useCallback((applet: Applet) => {
    navigation.navigate('EditMyBuysApplet' as never, { appletId: applet.appletId } as never);
  }, [navigation]);

  /**
   * Handle add button press
   */
  const handleAddPress = useCallback(() => {
    navigation.navigate('AddMyBuysApplet' as never);
  }, [navigation]);

  /**
   * Render applet tile
   */
  const renderAppletTile = (applet: Applet) => {
    return (
      <TouchableOpacity
        key={applet.appletId}
        style={styles.tileButton}
        onPress={() => handleAppletPress(applet)}
        onLongPress={() => handleAppletLongPress(applet)}
        activeOpacity={0.7}
        accessibilityLabel={`${applet.name} - Long press to edit`}
        accessibilityRole="button"
      >
        <View style={styles.tile}>
          {/* Color accent bar */}
          <View style={[styles.tileAccent, { backgroundColor: colors.primary }]} />
          
          {/* Tile content */}
          <View style={styles.tileContent}>
            {/* Icon */}
            <View style={[styles.iconContainer, { backgroundColor: colors.primary + '20' }]}>
              <Ionicons name="layers-outline" size={24} color={colors.primary} />
            </View>

            {/* Text content */}
            <View style={styles.tileTextContainer}>
              <Text style={styles.tileTitle} numberOfLines={2}>
                {applet.name}
              </Text>
              <Text style={styles.tileSubtitle} numberOfLines={1}>
                Custom Embed
              </Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
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
          {/* Dashed border effect */}
          <View style={styles.addTileBorder} />
          
          {/* Content */}
          <View style={styles.addTileContent}>
            <View style={styles.addIconContainer}>
              <Ionicons name="add" size={32} color={colors.textSecondary} />
            </View>
            <Text style={styles.addTileText}>Add Embed</Text>
          </View>
        </View>
      </TouchableOpacity>
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
            <Text style={styles.headerTitle}>My Buys</Text>
            <Text style={styles.headerSubtitle}>Custom workbook embeds</Text>
          </View>
        </View>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
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
              tintColor={colors.primary}
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
  addTile: {
    borderStyle: 'dashed',
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  addTileBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: borderRadius.md,
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
    backgroundColor: colors.primary,
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

