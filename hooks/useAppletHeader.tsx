import { useLayoutEffect } from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StackNavigationProp } from '@react-navigation/stack';
import { colors, spacing } from '../constants/Theme';

/**
 * Custom hook to set up applet screen header with Home button and consistent styling
 * Ensures header styling is applied correctly, especially when navigating via deep links
 * 
 * @param navigation - The navigation object from useNavigation hook
 * @param handleHomePress - Callback function to handle home button press
 * @param headerBackgroundColor - Optional header bar color (defaults to theme primary)
 * @param headerForegroundColor - Optional color for back icon, tint, and title text (defaults to theme background for dark headers)
 */
export function useAppletHeader(
  navigation: StackNavigationProp<any>,
  handleHomePress: () => void,
  headerBackgroundColor: string = colors.primary,
  headerForegroundColor: string = colors.background
) {
  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity
          onPress={handleHomePress}
          style={styles.headerButton}
          activeOpacity={0.7}
          accessibilityLabel="Go to Home"
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={24} color={headerForegroundColor} />
        </TouchableOpacity>
      ),
      // Re-assert header style to ensure it's applied (fixes magic link issue)
      headerStyle: {
        backgroundColor: headerBackgroundColor,
        elevation: 0,
        shadowOpacity: 0,
        borderBottomWidth: 0,
      },
      headerTintColor: headerForegroundColor,
      headerTitleStyle: {
        fontWeight: 'bold',
        color: headerForegroundColor,
      },
      headerTransparent: false,
    });
  }, [navigation, handleHomePress, headerBackgroundColor, headerForegroundColor]);
}

const styles = StyleSheet.create({
  headerButton: {
    padding: spacing.sm,
    marginLeft: spacing.sm,
  },
});

