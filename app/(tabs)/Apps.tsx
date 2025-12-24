import React, { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography, shadows } from '../../constants/Theme';
import { useAppletHeader } from '../../hooks/useAppletHeader';
import type { RootStackParamList } from '../_layout';

type AppsScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Apps'>;

interface CannedApplet {
  id: string;
  title: string;
  subtitle: string;
  iconName: keyof typeof Ionicons.glyphMap;
  color: string;
  onPress: () => void;
}

/**
 * Apps Page Component
 * Displays app applets in a grid layout
 */
export default function Apps() {
  const navigation = useNavigation<AppsScreenNavigationProp>();

  /**
   * Handle home button press
   * Uses goBack() to animate in the opposite direction (back animation)
   */
  const handleHomePress = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      // Fallback: navigate to Home if we can't go back
      navigation.navigate('Home' as never);
    }
  }, [navigation]);

  // Set up navigation header with Home button and consistent styling
  useAppletHeader(navigation, handleHomePress);

  /**
   * Handle Operations applet press
   */
  const handleNavigateToOperations = useCallback(() => {
    navigation.navigate('Operations' as never, { 
      appletId: '7', 
      appletName: 'Operations' 
    } as never);
  }, [navigation]);

  // App applets
  const applets: CannedApplet[] = [
    {
      id: '7',
      title: 'Operations',
      subtitle: 'Workflow',
      iconName: 'git-network-outline',
      color: colors.tileColors.orange1,
      onPress: handleNavigateToOperations,
    },
  ];

  /**
   * Render applet tile
   */
  const renderAppletTile = (applet: CannedApplet) => {
    return (
      <TouchableOpacity
        key={applet.id}
        style={styles.tileButton}
        onPress={applet.onPress}
        activeOpacity={0.7}
        accessibilityLabel={`${applet.title} - ${applet.subtitle}`}
        accessibilityRole="button"
      >
        <View style={styles.tile}>
          {/* Color accent bar */}
          <View style={[styles.tileAccent, { backgroundColor: applet.color }]} />
          
          {/* Tile content */}
          <View style={styles.tileContent}>
            {/* Icon */}
            <View style={[styles.iconContainer, { backgroundColor: applet.color + '20' }]}>
              <Ionicons name={applet.iconName} size={24} color={applet.color} />
            </View>

            {/* Text content */}
            <View style={styles.tileTextContainer}>
              <Text style={styles.tileTitle} numberOfLines={2}>
                {applet.title}
              </Text>
              <Text style={styles.tileSubtitle} numberOfLines={1}>
                {applet.subtitle}
              </Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

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
});

