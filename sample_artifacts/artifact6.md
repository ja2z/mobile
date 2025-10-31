# Integration Guide: Adding Authentication to Existing App

This guide shows how to integrate the authentication system into your existing mobile app.

---

## Step 1: Install Required Dependencies

```bash
# Install expo packages
npx expo install expo-secure-store expo-device expo-linking

# Install Buffer polyfill for JWT decoding
npm install buffer
```

---

## Step 2: Update Config.ts

Add the authentication API URL to your config:

```typescript
/**
 * Configuration file for the mobile app
 */

export const Config = {
  // API configuration
  API: {
    EMBED_URL_ENDPOINT: 'https://3x4hwcq05f.execute-api.us-west-2.amazonaws.com/v1/generateSigmaEmbedURL',
    AUTH_BASE_URL: 'https://YOUR-API-ID.execute-api.us-west-2.amazonaws.com/v1/auth', // ADD THIS
  },
  
  // App configuration
  APP_NAME: 'Big Buys Mobile',
  
  // ... rest of config remains the same
} as const;
```

---

## Step 3: Update app.json for Deep Linking

Add the deep link scheme to `app.json`:

```json
{
  "expo": {
    "name": "mobile-app",
    "slug": "mobile-app",
    "scheme": "bigbuys",  // ADD THIS LINE
    "version": "1.0.0",
    // ... rest of config
  }
}
```

---

## Step 4: Create Services Directory

Create a new directory and add the AuthService:

```
app/
  services/
    AuthService.ts  ← Copy from Artifact 4
```

---

## Step 5: Create Components Directory

Create auth-related components:

```
app/
  components/
    DashboardView.tsx  ← Already exists
    AuthScreen.tsx     ← Copy from Artifact 5
    DeepLinkHandler.tsx ← Extract from Artifact 5
```

**AuthScreen.tsx** and **DeepLinkHandler.tsx** can be extracted from Artifact 5, or keep them together as shown.

---

## Step 6: Update RootLayout (_layout.tsx)

Replace your existing `_layout.tsx` with this enhanced version:

```typescript
import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';
import Home from './(tabs)/Home';
import Dashboard from './(tabs)/Dashboard';
import { AuthScreen, DeepLinkHandler, AuthLoadingScreen } from '../components/AuthComponents';
import AuthService from '../services/AuthService';

// Define the navigation stack parameter list
export type RootStackParamList = {
  Auth: undefined;
  Home: undefined;
  Dashboard: { dashboardId?: string };
};

const Stack = createStackNavigator<RootStackParamList>();

/**
 * Root Layout Component
 * Sets up authentication and navigation
 */
export default function RootLayout() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Check authentication status on mount
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const authenticated = await AuthService.isAuthenticated();
      setIsAuthenticated(authenticated);
    } catch (error) {
      console.error('Error checking auth:', error);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAuthSuccess = async (dashboardId?: string) => {
    setIsAuthenticated(true);
    setAuthError(null);
    // If dashboardId is provided (from SMS deep link), you can navigate there
    // This will be handled by navigation after auth state updates
  };

  const handleAuthError = (error: string) => {
    setAuthError(error);
    setIsAuthenticated(false);
  };

  const handleSignOut = async () => {
    await AuthService.signOut();
    setIsAuthenticated(false);
  };

  // Show loading screen while checking auth
  if (isLoading) {
    return (
      <>
        <StatusBar style="auto" />
        <AuthLoadingScreen />
      </>
    );
  }

  return (
    <>
      {/* Deep link handler - always active */}
      <DeepLinkHandler
        onAuthSuccess={handleAuthSuccess}
        onError={handleAuthError}
      />

      <NavigationContainer>
        <StatusBar style="auto" />
        <Stack.Navigator
          screenOptions={{
            headerStyle: {
              backgroundColor: '#007AFF',
            },
            headerTintColor: '#FFFFFF',
            headerTitleStyle: {
              fontWeight: 'bold',
            },
          }}
        >
          {!isAuthenticated ? (
            // Auth Stack
            <Stack.Screen
              name="Auth"
              options={{
                headerShown: false,
                animationEnabled: false,
              }}
            >
              {(props) => (
                <AuthScreen
                  {...props}
                  onAuthSuccess={handleAuthSuccess}
                />
              )}
            </Stack.Screen>
          ) : (
            // App Stack
            <>
              <Stack.Screen
                name="Home"
                options={{
                  title: 'Home',
                  headerShown: false,
                }}
              >
                {(props) => (
                  <Home {...props} onSignOut={handleSignOut} />
                )}
              </Stack.Screen>
              <Stack.Screen
                name="Dashboard"
                component={Dashboard}
                options={{
                  title: 'Dashboard',
                  headerShown: true,
                }}
              />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </>
  );
}
```

---

## Step 7: Update Home.tsx

Add sign out functionality to Home screen:

```typescript
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Config } from '../../constants/Config';
import AuthService from '../../services/AuthService';

interface HomeProps {
  onSignOut: () => void;  // ADD THIS
}

/**
 * Home Page Component
 */
export default function Home({ onSignOut }: HomeProps) {  // UPDATE THIS
  const navigation = useNavigation();
  const [userEmail, setUserEmail] = useState<string>('');

  // Load user info
  useEffect(() => {
    loadUserInfo();
  }, []);

  const loadUserInfo = async () => {
    const user = await AuthService.getCurrentUser();
    if (user) {
      setUserEmail(user.email);
    }
  };

  const handleNavigateToDashboard = () => {
    navigation.navigate('Dashboard' as never);
  };

  const handleSignOut = async () => {
    // Confirm sign out
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: onSignOut,
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>{Config.APP_NAME}</Text>
        <Text style={styles.subtitle}>
          Access your dashboard and analytics
        </Text>

        {/* User info */}
        {userEmail && (
          <View style={styles.userInfo}>
            <Text style={styles.userEmail}>👤 {userEmail}</Text>
          </View>
        )}

        <TouchableOpacity
          style={styles.dashboardButton}
          onPress={handleNavigateToDashboard}
          activeOpacity={0.8}
          accessibilityLabel="Open Dashboard"
          accessibilityRole="button"
        >
          <Text style={styles.dashboardButtonText}>📊 Open Dashboard</Text>
        </TouchableOpacity>

        {/* ADD SIGN OUT BUTTON */}
        <TouchableOpacity
          style={styles.signOutButton}
          onPress={handleSignOut}
          activeOpacity={0.8}
        >
          <Text style={styles.signOutButtonText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // ... existing styles ...

  // ADD THESE NEW STYLES:
  userInfo: {
    backgroundColor: '#E5F3FF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 24,
  },
  userEmail: {
    fontSize: 16,
    color: '#0066CC',
    textAlign: 'center',
  },
  signOutButton: {
    marginTop: 16,
    paddingVertical: 12,
  },
  signOutButtonText: {
    color: '#FF3B30',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});
```

---

## Step 8: Update DashboardView.tsx

Modify `DashboardView.tsx` to include user context in embed URL:

```typescript
// At the top, add import
import AuthService from '../services/AuthService';

// Update the fetchUrl function to include user context:
const fetchUrl = async () => {
  try {
    setFetchingUrl(true);
    setError(null);
    setWorkbookLoaded(false);

    // GET USER CONTEXT - ADD THIS
    const user = await AuthService.getCurrentUser();
    const sessionToken = await AuthService.getSessionToken();

    const requestBody = {
      // Include user context for personalized embeds
      email: user?.email,
      userId: user?.userId,
      // sessionToken can be used for additional verification if needed
    };

    const response = await fetch(Config.API.EMBED_URL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Optionally include session token for backend verification
        ...(sessionToken && { 'Authorization': `Bearer ${sessionToken}` }),
      },
      body: JSON.stringify(requestBody),  // UPDATE THIS LINE
    });

    // ... rest of the function remains the same
  } catch (err) {
    // ... error handling
  }
};
```

---

## Step 9: Update EmbedUrlService.ts

Optionally update your backend Lambda to accept user context:

```typescript
// In your generateSigmaEmbedURL Lambda function:
export const handler = async (event: any) => {
  const body = JSON.parse(event.body || '{}');
  
  // Extract user context
  const { email, userId } = body;
  
  // Include user context in Sigma embed URL generation
  const embedUrl = await generateSigmaUrl({
    workbookId: 'your-workbook-id',
    email: email,  // Use for personalization or RLS
    userId: userId,
    // ... other params
  });
  
  // ... rest of handler
};
```

---

## Step 10: Testing the Integration

### Test Email Flow:

1. Start your app in Expo Go or iOS simulator
2. You should see the Auth screen
3. Enter your `@sigmacomputing.com` email
4. Check your email for the magic link
5. Click the link (on device) or copy the URL
6. If in simulator, use: `xcrun simctl openurl booted "bigbuys://auth?token=YOUR_TOKEN"`
7. App should authenticate and show Home screen

### Test Deep Linking in iOS Simulator:

```bash
# Open magic link in simulator
xcrun simctl openurl booted "bigbuys://auth?token=tok_ml_abc123"

# With dashboard deep link
xcrun simctl openurl booted "bigbuys://auth?token=tok_ml_abc123&dashboardId=workbook_xyz"
```

---

## Step 11: Handle Session Expiry

Add session check in Dashboard component:

```typescript
// In Dashboard.tsx
import { useEffect } from 'react';
import { useNavigation } from '@react-navigation/native';
import AuthService from '../../services/AuthService';

export default function Dashboard() {
  const navigation = useNavigation();

  // Check session validity
  useEffect(() => {
    const checkSession = async () => {
      const isAuth = await AuthService.isAuthenticated();
      if (!isAuth) {
        // Session expired, navigate back to auth
        navigation.navigate('Auth' as never);
      }
    };

    checkSession();

    // Check periodically
    const interval = setInterval(checkSession, 60000); // Every minute

    return () => clearInterval(interval);
  }, [navigation]);

  return (
    // ... existing Dashboard component
  );
}
```

---

## Step 12: Build and Test

### For Development (Expo Go):

```bash
# Start dev server
npx expo start

# Test on your iPhone via Expo Go
# Scan QR code with Camera app
```

### For TestFlight Deployment:

```bash
# Build for iOS
eas build --platform ios --profile production

# Submit to TestFlight
eas submit --platform ios
```

---

## Summary of Changes

### New Files Created:
- `app/services/AuthService.ts`
- `app/components/AuthComponents.tsx` (contains AuthScreen, DeepLinkHandler, etc.)

### Modified Files:
- `app.json` - Added deep link scheme
- `constants/Config.ts` - Added AUTH_BASE_URL
- `app/_layout.tsx` - Added authentication flow and deep link handling
- `app/(tabs)/Home.tsx` - Added sign out functionality and user info
- `components/DashboardView.tsx` - Added user context to embed URL
- `services/EmbedUrlService.ts` - (Optional) Accept user context

### Dependencies Added:
- `expo-secure-store`
- `expo-device`
- `expo-linking`
- `buffer`

---

## Next Steps

1. Test email magic link flow
2. Test SMS magic link flow (from desktop app)
3. Test session persistence across app restarts
4. Test session expiry and refresh
5. Deploy to TestFlight for internal testing
6. Add approved emails to DynamoDB for external testers

---

## Troubleshooting

### Deep links not working in iOS simulator:
```bash
# Use xcrun to simulate opening URL
xcrun simctl openurl booted "bigbuys://auth?token=YOUR_TOKEN"
```

### "Buffer is not defined" error:
Add to top of AuthService.ts:
```typescript
import { Buffer } from 'buffer';
global.Buffer = Buffer;
```

### Session not persisting:
- Check expo-secure-store is installed
- Check device has keychain access
- Try clearing app data and reinstalling

### Email not sending:
- Verify SES domain/email is verified
- Check Lambda logs in CloudWatch
- Ensure SES is out of sandbox mode