import React, { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography, shadows } from '../../constants/Theme';
import { useAppletHeader } from '../../hooks/useAppletHeader';
import type { RootStackParamList } from '../_layout';

type AIScreenNavigationProp = StackNavigationProp<RootStackParamList, 'AI'>;

interface CannedApplet {
  id: string;
  title: string;
  subtitle: string;
  iconName: keyof typeof Ionicons.glyphMap;
  color: string;
  onPress: () => void;
}

/**
 * AI Page Component
 * Displays AI-related applets in a grid layout
 */
export default function AI() {
  const navigation = useNavigation<AIScreenNavigationProp>();

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
   * Handle AI Chat applet press
   */
  const handleNavigateToAIChat = useCallback(() => {
    navigation.navigate('AIChat' as never, { 
      appletId: '6', 
      appletName: 'AI Chat' 
    } as never);
  }, [navigation]);

  /**
   * Handle AI Query applet press
   */
  const handleNavigateToConversationalAI = useCallback(() => {
    navigation.navigate('ConversationalAI' as never, { 
      appletId: '5', 
      appletName: 'AI Query' 
    } as never);
  }, [navigation]);

  /**
   * Handle AI Newsletter applet press
   */
  const handleNavigateToAINewsletter = useCallback(() => {
    navigation.navigate('AINewsletter' as never, { 
      appletId: '3', 
      appletName: 'AI Newsletter' 
    } as never);
  }, [navigation]);

  /**
   * Handle Ask Big Buys applet press
   */
  const handleNavigateToAskBigBuys = useCallback(() => {
    navigation.navigate('AskBigBuys' as never, { 
      appletName: 'Ask Big Buys' 
    } as never);
  }, [navigation]);

  // AI applets
  const applets: CannedApplet[] = [
    {
      id: 'ask-big-buys',
      title: 'Ask Big Buys',
      subtitle: 'Ask Sigma',
      iconName: 'chatbubbles-outline',
      color: colors.tileColors.orange1,
      onPress: handleNavigateToAskBigBuys,
    },
    {
      id: '6',
      title: 'AI Chat',
      subtitle: 'Chat Element',
      iconName: 'chatbubbles-outline',
      color: colors.tileColors.orange1,
      onPress: handleNavigateToAIChat,
    },
    {
      id: '5',
      title: 'AI Query',
      subtitle: 'AI Assistant',
      iconName: 'chatbubbles-outline',
      color: colors.tileColors.orange1,
      onPress: handleNavigateToConversationalAI,
    },
    {
      id: '3',
      title: 'AI Newsletter',
      subtitle: 'Content',
      iconName: 'sparkles-outline',
      color: colors.tileColors.orange1,
      onPress: handleNavigateToAINewsletter,
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

