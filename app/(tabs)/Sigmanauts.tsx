import React, { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography, shadows } from '../../constants/Theme';
import { useAppletHeader } from '../../hooks/useAppletHeader';
import type { RootStackParamList } from '../_layout';

type SigmanautsScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Sigmanauts'>;

interface CannedApplet {
  id: string;
  title: string;
  subtitle: string;
  iconName: keyof typeof Ionicons.glyphMap;
  color: string;
  onPress: () => void;
}

/**
 * Sigmanauts Page Component
 * Displays canned applets for Sigma employees in a grid layout
 */
export default function Sigmanauts() {
  const navigation = useNavigation<SigmanautsScreenNavigationProp>();

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
   * Handle GTM applet press
   */
  const handleNavigateToGTM = useCallback(() => {
    navigation.navigate('GTM' as never, { 
      appletId: '8', 
      appletName: 'GTM' 
    } as never);
  }, [navigation]);

  /**
   * Handle Ask J.A.K.E. applet press
   */
  const handleNavigateToAskJAKE = useCallback(() => {
    navigation.navigate('AskJAKE' as never, { 
      appletName: 'Ask J.A.K.E.' 
    } as never);
  }, [navigation]);

  // Canned applets for Sigmanauts
  const applets: CannedApplet[] = [
    {
      id: '8',
      title: 'GTM',
      subtitle: 'Operations',
      iconName: 'trending-up-outline',
      color: colors.tileColors.orange1,
      onPress: handleNavigateToGTM,
    },
    {
      id: 'ask-jake',
      title: 'Ask J.A.K.E.',
      subtitle: 'AI Assistant',
      iconName: 'chatbubbles-outline',
      color: colors.tileColors.orange1,
      onPress: handleNavigateToAskJAKE,
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

