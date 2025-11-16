import React, { useEffect, useState, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Login from './(tabs)/Login';
import ExpiredLink from './(tabs)/ExpiredLink';
import Home from './(tabs)/Home';
import Dashboard from './(tabs)/Dashboard';
import AINewsletter from './(tabs)/AINewsletter';
import ConversationalAI from './(tabs)/ConversationalAI';
import Admin from './(tabs)/Admin';
import ActivityLog from './(tabs)/ActivityLog';
import EditUser from './(tabs)/EditUser';
import AddWhitelistUser from './(tabs)/AddWhitelistUser';
import MyBuys from './(tabs)/MyBuys';
import AddMyBuysApplet from './(tabs)/AddMyBuysApplet';
import EditMyBuysApplet from './(tabs)/EditMyBuysApplet';
import ViewMyBuysApplet from './(tabs)/ViewMyBuysApplet';
import { Alert } from 'react-native';
import { colors, spacing, typography } from '../constants/Theme';
import { AuthService } from '../services/AuthService';
import { ActivityService } from '../services/ActivityService';

// Define the navigation stack parameter list
export type RootStackParamList = {
  Login: undefined;
  ExpiredLink: { email?: string; errorType?: 'expired' | 'invalid' | 'used' };
  Home: undefined;
  Dashboard: { appletId?: string; appletName?: string };
  AINewsletter: { appletId?: string; appletName?: string };
  ConversationalAI: { appletId?: string; appletName?: string };
  Admin: undefined;
  ActivityLog: undefined;
  EditUser: { user: import('../services/AdminService').User };
  AddWhitelistUser: undefined;
  MyBuys: undefined;
  AddMyBuysApplet: undefined;
  EditMyBuysApplet: { appletId: string };
  ViewMyBuysApplet: { appletId: string };
};

const Stack = createStackNavigator<RootStackParamList>();

/**
 * Root Layout Component
 * Sets up the main navigation structure for the app
 * Handles authentication checks and deep link routing
 */
export default function RootLayout() {
  const [initialRoute, setInitialRoute] = useState<keyof RootStackParamList | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isVerifyingMagicLink, setIsVerifyingMagicLink] = useState(false);
  const [expiredLinkParams, setExpiredLinkParams] = useState<{ email?: string; errorType?: 'expired' | 'invalid' | 'used' } | null>(null);
  const navigationRef = useRef<any>(null);

  useEffect(() => {
    // Check if user is already authenticated
    const checkAuth = async () => {
      try {
        const isAuthenticated = await AuthService.isAuthenticated();
        if (isAuthenticated) {
          setInitialRoute('Home');
          // Log app launch
          await ActivityService.logActivity('app_launch', {
            source: 'cold_start',
          });
        } else {
          setInitialRoute('Login');
        }
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
        setIsVerifyingMagicLink(true);
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
          
          // Log app launch (from deep link)
          await ActivityService.logActivity('app_launch', {
            source: 'deep_link',
            app: app || null,
          });
          
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
                // Hide loading indicator after navigation completes
                setIsVerifyingMagicLink(false);
              } catch (error) {
                console.warn('Navigation error (will retry):', error);
                if (retryCount < maxRetries) {
                  retryCount++;
                  setTimeout(navigateToScreen, 200);
                } else {
                  setIsVerifyingMagicLink(false);
                }
              }
            } else {
              // Navigation ref not ready yet, retry
              if (retryCount < maxRetries) {
                retryCount++;
                setTimeout(navigateToScreen, 200);
              } else {
                console.warn('⚠️ Navigation ref not ready after max retries');
                setIsVerifyingMagicLink(false);
              }
            }
          };
          
          // Start navigation attempt after a brief delay to ensure navigation is initialized
          setTimeout(navigateToScreen, 300);
        } catch (error: any) {
          // Only log as error if it's not a token expiration (which is expected)
          if (!error.isTokenExpired) {
            console.error('❌ Deep link auth error:', error);
          } else {
            console.log('🔗 Token expired/invalid (expected):', error.message);
          }
          const errorMessage = error instanceof Error ? error.message : 'Authentication failed';
          
          // Handle token expiration/invalid errors - navigate to ExpiredLink screen
          if (error.isTokenExpired) {
            // Don't log as error to avoid error toast - this is expected behavior
            console.log('🔗 Token expired/invalid, navigating to ExpiredLink screen');
            setIsCheckingAuth(false);
            
            // Store params for ExpiredLink screen - this will be used as initialParams
            const paramsToStore = {
              errorType: error.errorType || 'invalid',
              email: error.email,
            };
            setExpiredLinkParams(paramsToStore);
            
            console.log('📧 Email from error:', error.email, 'Error type:', error.errorType);
            
            // Set initialRoute to ExpiredLink so NavigationContainer can render
            // The expiredLinkParams state will be used as initialParams
            setInitialRoute('ExpiredLink');
            
            // Hide loading screen so NavigationContainer can render
            // The component will receive params via initialParams
            setIsVerifyingMagicLink(false);
          } 
          // Handle account expiration errors
          else if (error.isExpirationError) {
            Alert.alert(
              'Account Expired',
              errorMessage,
              [
                {
                  text: 'OK',
                  onPress: () => {
                    if (isCheckingAuth) {
                      setInitialRoute('Login');
                      setIsCheckingAuth(false);
                    }
                  },
                },
              ]
            );
          } else {
            // For other errors, navigate to ExpiredLink with generic error
            // Don't log as error to avoid error toast - log as warning instead
            console.warn('⚠️ Deep link error (non-token):', errorMessage);
            setIsCheckingAuth(false);
            // Keep isVerifyingMagicLink true to show loading screen until navigation completes
            
            // Store params for ExpiredLink screen
            setExpiredLinkParams({
              errorType: 'invalid',
              email: error.email,
            });
            
            // Navigate to ExpiredLink screen
            // Use reset() to navigate - this ensures clean navigation stack with params
            let retryCount = 0;
            const maxRetries = 10;
            
            const navigateToExpiredLink = () => {
              if (navigationRef.current) {
                try {
                  navigationRef.current.reset({
                    index: 0,
                    routes: [{ 
                      name: 'ExpiredLink',
                      params: {
                        errorType: 'invalid',
                        email: error.email,
                      }
                    }],
                  });
                  console.log('✅ Navigated to ExpiredLink screen with email:', error.email);
                  // Hide loading screen after successful navigation
                  setIsVerifyingMagicLink(false);
                } catch (navError) {
                  console.warn('Navigation error (will retry):', navError);
                  if (retryCount < maxRetries) {
                    retryCount++;
                    setTimeout(navigateToExpiredLink, 200);
                  } else {
                    // Fallback: navigation failed, hide loading screen and set initial route
                    setInitialRoute('ExpiredLink');
                    setIsVerifyingMagicLink(false);
                  }
                }
              } else {
                if (retryCount < maxRetries) {
                  retryCount++;
                  setTimeout(navigateToExpiredLink, 200);
                } else {
                  // Fallback: navigation ref never became available, set initial route
                  setInitialRoute('ExpiredLink');
                  setIsVerifyingMagicLink(false);
                }
              }
            };
            
            setTimeout(navigateToExpiredLink, 300);
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

  // Show loading screen while checking auth status or verifying magic link
  if (isCheckingAuth || initialRoute === null || isVerifyingMagicLink) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <StatusBar style="auto" />
        <View style={styles.loadingContent}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>
            {isVerifyingMagicLink ? 'Logging in...' : 'Loading...'}
          </Text>
          {isVerifyingMagicLink && (
            <Text style={styles.loadingSubtext}>
              Setting up your account
            </Text>
          )}
        </View>
      </SafeAreaView>
    );
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
          name="ExpiredLink" 
          component={ExpiredLink}
          initialParams={expiredLinkParams || undefined}
          options={{
            title: 'Link Expired',
            headerShown: false, // Full-screen branded experience
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
        <Stack.Screen 
          name="Admin" 
          component={Admin}
          options={{
            title: 'Admin',
            headerShown: true,
          }}
        />
        <Stack.Screen 
          name="ActivityLog" 
          component={ActivityLog}
          options={{
            title: 'Activity Log',
            headerShown: true,
          }}
        />
        <Stack.Screen 
          name="EditUser" 
          component={EditUser}
          options={{
            title: 'Edit User',
            headerShown: true,
          }}
        />
        <Stack.Screen 
          name="AddWhitelistUser" 
          component={AddWhitelistUser}
          options={{
            title: 'Add Whitelist User',
            headerShown: true,
          }}
        />
        <Stack.Screen 
          name="MyBuys" 
          component={MyBuys}
          options={{
            title: 'My Buys',
            headerShown: false,
          }}
        />
        <Stack.Screen 
          name="AddMyBuysApplet" 
          component={AddMyBuysApplet}
          options={{
            title: 'Add Applet',
            headerShown: true,
          }}
        />
        <Stack.Screen 
          name="EditMyBuysApplet" 
          component={EditMyBuysApplet}
          options={{
            title: 'Edit Applet',
            headerShown: true,
          }}
        />
        <Stack.Screen 
          name="ViewMyBuysApplet" 
          component={ViewMyBuysApplet}
          options={{
            title: 'View Applet',
            headerShown: true,
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    ...typography.h3,
    color: colors.textPrimary,
    marginTop: spacing.lg,
    textAlign: 'center',
  },
  loadingSubtext: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
});
