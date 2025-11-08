import React, { useEffect, useState, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import Login from './(tabs)/Login';
import Home from './(tabs)/Home';
import Dashboard from './(tabs)/Dashboard';
import AINewsletter from './(tabs)/AINewsletter';
import ConversationalAI from './(tabs)/ConversationalAI';
import { colors } from '../constants/Theme';
import { AuthService } from '../services/AuthService';

// Define the navigation stack parameter list
export type RootStackParamList = {
  Login: undefined;
  Home: undefined;
  Dashboard: undefined;
  AINewsletter: undefined;
  ConversationalAI: undefined;
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
      console.log('🔗 Deep link received:', url);
      
      const parsed = Linking.parse(url);
      console.log('📋 Parsed deep link:', JSON.stringify(parsed, null, 2));
      
      // Handle both bigbuys://auth?token=xxx and https://mobile.bigbuys.io/auth/verify?token=xxx
      let token: string | undefined;
      
      if (parsed.scheme === 'bigbuys' && parsed.hostname === 'auth') {
        // Custom URL scheme: bigbuys://auth?token=xxx
        token = parsed.queryParams?.token as string;
        console.log('✅ Parsed custom scheme token:', token ? 'found' : 'missing');
      } else if (parsed.hostname === 'mobile.bigbuys.io') {
        // Universal link: https://mobile.bigbuys.io/auth/verify?token=xxx
        // Path might be "auth/verify" or "/auth/verify" - both are valid
        const path = parsed.path || '';
        // Check if this is an auth verify path OR just check for token in queryParams
        if (path.includes('auth/verify') || path === '' || parsed.queryParams?.token) {
          token = parsed.queryParams?.token as string;
          console.log('✅ Parsed universal link token:', token ? 'found' : 'missing', { path });
        }
      }

      if (token) {
        console.log('🔐 Verifying magic link token...');
        try {
          const app = parsed.queryParams?.app as string | undefined;
          const session = await AuthService.verifyMagicLink(token);
          console.log('✅ Authentication successful!', { email: session.user.email });
          
          // Map app name to screen name
          // Valid app names: "dashboard", "ainewsletter" (case-insensitive)
          // Default to "Home" if no app specified or invalid app name
          let targetScreen: 'Home' | 'Dashboard' | 'AINewsletter' = 'Home';
          if (app) {
            const appLower = app.toLowerCase();
            if (appLower === 'dashboard') {
              targetScreen = 'Dashboard';
            } else if (appLower === 'ainewsletter' || appLower === 'ai-newsletter') {
              targetScreen = 'AINewsletter';
            } else {
              console.warn(`⚠️ Unknown app name: ${app}, defaulting to Home`);
            }
          }
          
          // Update initial route if it hasn't been set yet (for when deep link comes before initial auth check)
          setInitialRoute(targetScreen);
          setIsCheckingAuth(false);
          
          // Navigate to target screen after successful auth
          // Use a retry mechanism since navigation might not be ready immediately
          let retryCount = 0;
          const maxRetries = 10;
          
          const navigateToScreen = () => {
            if (navigationRef.current) {
              try {
                // If navigating to a specific app, we need to navigate to Home first, then to the app
                if (targetScreen === 'Dashboard' || targetScreen === 'AINewsletter') {
                  navigationRef.current.reset({
                    index: 1,
                    routes: [
                      { name: 'Home' },
                      { name: targetScreen }
                    ],
                  });
                } else {
                  navigationRef.current.reset({
                    index: 0,
                    routes: [{ name: 'Home' }],
                  });
                }
                console.log(`✅ Navigated to ${targetScreen}`);
              } catch (error) {
                console.warn('Navigation error (will retry):', error);
                if (retryCount < maxRetries) {
                  retryCount++;
                  setTimeout(navigateToScreen, 200);
                }
              }
            } else {
              // Navigation ref not ready yet, retry
              if (retryCount < maxRetries) {
                retryCount++;
                setTimeout(navigateToScreen, 200);
              } else {
                console.warn('⚠️ Navigation ref not ready after max retries');
              }
            }
          };
          
          // Start navigation attempt after a brief delay to ensure navigation is initialized
          setTimeout(navigateToScreen, 300);
        } catch (error) {
          console.error('❌ Deep link auth error:', error);
          const errorMessage = error instanceof Error ? error.message : 'Authentication failed';
          // For now, just log the error - in a real app, you'd show this to the user
          console.error('Error details:', errorMessage);
          // Still set initial route to Login on error
          if (isCheckingAuth) {
            setInitialRoute('Login');
            setIsCheckingAuth(false);
          }
        }
      } else {
        console.warn('⚠️ No token found in deep link');
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
        <Stack.Screen 
          name="ConversationalAI" 
          component={ConversationalAI}
          options={{
            title: 'Conversational AI',
            headerShown: true,
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
