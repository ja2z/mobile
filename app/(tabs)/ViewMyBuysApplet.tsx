import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { StackNavigationProp, RouteProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { MyBuysService } from '../../services/MyBuysService';
import { AuthService } from '../../services/AuthService';
import { Config } from '../../constants/Config';
import { colors, spacing, typography } from '../../constants/Theme';
import type { RootStackParamList } from '../_layout';

type ViewMyBuysAppletScreenNavigationProp = StackNavigationProp<RootStackParamList, 'ViewMyBuysApplet'>;
type ViewMyBuysAppletScreenRouteProp = RouteProp<RootStackParamList, 'ViewMyBuysApplet'>;

/**
 * View My Buys Applet Screen Component
 * Displays the applet in an iframe using DashboardView
 */
export default function ViewMyBuysApplet() {
  const navigation = useNavigation<ViewMyBuysAppletScreenNavigationProp>();
  const route = useRoute<ViewMyBuysAppletScreenRouteProp>();
  const { appletId } = route.params;

  const [appletName, setAppletName] = useState<string>('');
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.headerButton}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  /**
   * Load applet and get regenerated URL
   */
  useEffect(() => {
    const loadApplet = async () => {
      try {
        setLoading(true);
        setError(null);

        // Get applet name
        const applets = await MyBuysService.listApplets();
        const applet = applets.find(a => a.appletId === appletId);
        if (!applet) {
          throw new Error('Applet not found');
        }
        setAppletName(applet.name);

        // Get regenerated URL
        const result = await MyBuysService.getRegeneratedUrl(appletId);
        setEmbedUrl(result.url);
      } catch (error: any) {
        console.error('Error loading applet:', error);
        if (error.isExpirationError) {
          Alert.alert(
            'Account Expired',
            error.message || 'Your account has expired. You can no longer use the app.',
            [
              {
                text: 'OK',
                onPress: async () => {
                  await AuthService.clearSession();
                  navigation.reset({
                    index: 0,
                    routes: [{ name: 'Login' }],
                  });
                },
              },
            ]
          );
        } else {
          setError(error.message || 'Failed to load applet');
        }
      } finally {
        setLoading(false);
      }
    };

    loadApplet();
  }, [appletId, navigation]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading applet...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.error} />
          <Text style={styles.errorTitle}>Failed to Load</Text>
          <Text style={styles.errorMessage}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => {
              setLoading(true);
              setError(null);
              // Reload
              const loadApplet = async () => {
                try {
                  const applets = await MyBuysService.listApplets();
                  const applet = applets.find(a => a.appletId === appletId);
                  if (applet) {
                    setAppletName(applet.name);
                    const result = await MyBuysService.getRegeneratedUrl(appletId);
                    setEmbedUrl(result.url);
                  }
                } catch (err: any) {
                  setError(err.message || 'Failed to load applet');
                } finally {
                  setLoading(false);
                }
              };
              loadApplet();
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!embedUrl) {
    return null;
  }

  // Generate HTML wrapper with iframe to properly capture Sigma embed events
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        html, body {
          width: 100%;
          height: 100%;
          overflow: hidden;
        }
        iframe {
          width: 100%;
          height: 100%;
          border: none;
          display: block;
        }
      </style>
    </head>
    <body>
      <iframe id="sigma-embed" src="${embedUrl}" allow="fullscreen"></iframe>
      <script>
        console.log('📱 My Buys Iframe wrapper: Initializing...');
        
        // Listen for messages from the Sigma iframe
        window.addEventListener('message', function(event) {
          console.log('📱 My Buys Iframe wrapper: Received message from iframe');
          console.log('📱 Message data:', event.data);
          console.log('📱 Message origin:', event.origin);
          
          // Forward all messages to React Native
          if (window.ReactNativeWebView) {
            try {
              const messageStr = typeof event.data === 'string' ? event.data : JSON.stringify(event.data);
              console.log('📱 Forwarding to ReactNativeWebView:', messageStr);
              window.ReactNativeWebView.postMessage(messageStr);
            } catch (err) {
              console.error('📱 Error forwarding message:', err);
            }
          }
        }, false);
        
        console.log('📱 My Buys Iframe wrapper: Ready and listening for messages');
      </script>
    </body>
    </html>
  `;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header with applet name */}
      <View style={styles.header}>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {appletName}
        </Text>
      </View>

      {/* WebView */}
      <WebView
        source={{ html: htmlContent, baseUrl: 'https://app.sigmacomputing.com' }}
        style={styles.webview}
        userAgent={Config.WEBVIEW.USER_AGENT}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        scalesPageToFit={true}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        contentInset={{ top: 0, bottom: 0, left: 0, right: 0 }}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        automaticallyAdjustsScrollIndicatorInsets={false}
        scrollEnabled={true}
        bounces={false}
        originWhitelist={['*']}
        mixedContentMode="always"
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.error('WebView error:', nativeEvent);
          setError('Failed to load applet. Please check your configuration.');
          setLoading(false);
        }}
        onHttpError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.error('WebView HTTP error:', nativeEvent);
          setError(`HTTP Error ${nativeEvent.statusCode}: ${nativeEvent.description}`);
          setLoading(false);
        }}
      />
      
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading applet...</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerTitle: {
    ...typography.h3,
    color: colors.textPrimary,
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  errorTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  errorMessage: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 8,
  },
  retryButtonText: {
    ...typography.body,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  headerButton: {
    padding: spacing.sm,
    marginLeft: spacing.sm,
  },
  webview: {
    flex: 1,
    margin: 0,
    padding: 0,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
});

