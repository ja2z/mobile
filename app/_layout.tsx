import React, { useEffect, useState, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import Login from './(tabs)/Login';
import Home from './(tabs)/Home';
import Dashboard from './(tabs)/Dashboard';
import AINewsletter from './(tabs)/AINewsletter';
import { colors } from '../constants/Theme';
import { AuthService } from '../services/AuthService';

// Define the navigation stack parameter list
export type RootStackParamList = {
  Login: undefined;
  Home: undefined;
  Dashboard: undefined;
  AINewsletter: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();

/**
 * Root Layout Component
 * Sets up the main navigation structure for the app
 * Handles authentication checks and deep link routing
 */
export default function RootLayout() {
  const [initialRoute, setInitialRoute] = useState<'Login' | 'Home' | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const navigationRef = useRef<any>(null);

  useEffect(() => {
    // Check if user is already authenticated
    const checkAuth = async () => {
      try {
        const isAuthenticated = await AuthService.isAuthenticated();
        setInitialRoute(isAuthenticated ? 'Home' : 'Login');
      } catch (error) {
        console.error('Error checking authentication:', error);
        setInitialRoute('Login');
      } finally {
        setIsCheckingAuth(false);
      }
    };

    checkAuth();

    // Handle deep links
    const handleDeepLink = async (url: string) => {
      console.log('Deep link received:', url);
      
      const parsed = Linking.parse(url);
      
      // Handle both bigbuys://auth?token=xxx and https://mobile.bigbuys.io/auth/verify?token=xxx
      let token: string | undefined;
      
      if (parsed.scheme === 'bigbuys' && parsed.hostname === 'auth') {
        // Custom URL scheme: bigbuys://auth?token=xxx
        token = parsed.queryParams?.token as string;
      } else if (parsed.hostname === 'mobile.bigbuys.io' && parsed.path === '/auth/verify') {
        // Universal link: https://mobile.bigbuys.io/auth/verify?token=xxx
        token = parsed.queryParams?.token as string;
      }

      if (token) {
        try {
          const dashboardId = parsed.queryParams?.dashboardId as string | undefined;
          await AuthService.verifyMagicLink(token, dashboardId);
          
          // Navigate to Home after successful auth
          // Wait a bit for navigation to be ready
          setTimeout(() => {
            if (navigationRef.current) {
              navigationRef.current.reset({
                index: 0,
                routes: [{ name: 'Home' }],
              });
            }
          }, 100);
        } catch (error) {
          console.error('Deep link auth error:', error);
          // Could show error to user - for now just log it
        }
      }
    };

    // Handle initial URL (if app opened via deep link)
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleDeepLink(url);
      }
    });

    // Listen for deep links while app is running
    const subscription = Linking.addEventListener('url', (event) => {
      handleDeepLink(event.url);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  // Show nothing while checking auth status
  if (isCheckingAuth || initialRoute === null) {
    return null;
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <StatusBar style="auto" />
      <Stack.Navigator
        initialRouteName={initialRoute}
        screenOptions={{
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: '#FFFFFF',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        }}
      >
        <Stack.Screen 
          name="Login" 
          component={Login}
          options={{
            title: 'Login',
            headerShown: false, // Full-screen branded login experience
          }}
        />
        <Stack.Screen 
          name="Home" 
          component={Home}
          options={{
            title: 'Home',
            headerShown: false, // Hide header for cleaner home page
          }}
        />
        <Stack.Screen 
          name="Dashboard" 
          component={Dashboard}
          options={{
            title: 'Dashboard',
            headerShown: true,
          }}
        />
        <Stack.Screen 
          name="AINewsletter" 
          component={AINewsletter}
          options={{
            title: 'AI Newsletter',
            headerShown: true,
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
