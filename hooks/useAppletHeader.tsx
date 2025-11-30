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
 */
export function useAppletHeader(
  navigation: StackNavigationProp<any>,
  handleHomePress: () => void
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
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      ),
      // Re-assert header style to ensure it's applied (fixes magic link issue)
      headerStyle: {
        backgroundColor: colors.primary,
        elevation: 0,
        shadowOpacity: 0,
        borderBottomWidth: 0,
      },
      headerTintColor: '#FFFFFF',
      headerTitleStyle: {
        fontWeight: 'bold',
      },
      headerTransparent: false,
    });
  }, [navigation, handleHomePress]);
}

const styles = StyleSheet.create({
  headerButton: {
    padding: spacing.sm,
    marginLeft: spacing.sm,
  },
});

