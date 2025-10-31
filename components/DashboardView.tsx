import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Animated } from 'react-native';
import { WebView } from 'react-native-webview';
import { Config } from '../constants/Config';
import { EmbedUrlService } from '../services/EmbedUrlService';
import { colors, spacing, typography } from '../constants/Theme';

interface DashboardViewProps {
  workbookId?: string; // Optional workbook ID to load specific workbook
}

export interface DashboardViewRef {
  sendMessage: (message: any) => void;
}

/**
 * Skeleton Placeholder Component
 * Shows animated skeleton while dashboard loads
 */
const SkeletonPlaceholder: React.FC = () => {
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const shimmer = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnim, {
          toValue: 0,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    );
    shimmer.start();
    return () => shimmer.stop();
  }, []);

  const opacity = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  return (
    <View style={styles.skeletonContainer}>
      {/* Header skeleton */}
      <Animated.View style={[styles.skeletonHeader, { opacity }]} />
      
      {/* Chart skeletons */}
      <View style={styles.skeletonChartsRow}>
        <Animated.View style={[styles.skeletonChartLarge, { opacity }]} />
        <Animated.View style={[styles.skeletonChartSmall, { opacity }]} />
      </View>
      
      <View style={styles.skeletonChartsRow}>
        <Animated.View style={[styles.skeletonChartMedium, { opacity }]} />
        <Animated.View style={[styles.skeletonChartMedium, { opacity }]} />
      </View>
      
      {/* Table skeleton */}
      <Animated.View style={[styles.skeletonTable, { opacity }]} />
    </View>
  );
};

/**
 * Dashboard WebView Component
 * Handles loading external dashboard content with proper error handling
 * and automatic URL refresh before token expiry
 */
export const DashboardView = forwardRef<DashboardViewRef, DashboardViewProps>(({ workbookId }, ref) => {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [workbookLoaded, setWorkbookLoaded] = useState(false); // Track workbook:loaded event
  const [error, setError] = useState<string | null>(null);
  const [fetchingUrl, setFetchingUrl] = useState(true);
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const webViewRef = useRef<WebView>(null);

  /**
   * Send a message to the embedded iframe
   */
  const sendMessage = (message: any) => {
    console.log('🚀 sendMessage called with:', message);
    
    if (!webViewRef.current) {
      console.error('❌ webViewRef.current is null!');
      return;
    }
    
    console.log('✅ webViewRef.current exists, injecting JavaScript...');
    
    const messageStr = JSON.stringify(message);
    const escapedMessageStr = messageStr.replace(/'/g, "\\'");
    
    const js = `
      (function() {
        try {
          console.log('🔧 Injected JS: Starting...');
          const iframe = document.getElementById('sigma-embed');
          
          if (!iframe) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'debug',
              message: 'ERROR: iframe not found'
            }));
            return;
          }
          
          console.log('🔧 Injected JS: iframe found');
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'debug',
            message: 'iframe found, attempting to send message'
          }));
          
          if (!iframe.contentWindow) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'debug',
              message: 'ERROR: iframe.contentWindow is null'
            }));
            return;
          }
          
          const messageToSend = ${messageStr};
          console.log('🔧 Injected JS: Sending message to iframe:', messageToSend);
          
          iframe.contentWindow.postMessage(messageToSend, 'https://app.sigmacomputing.com');
          
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'debug',
            message: 'Message sent successfully to iframe',
            sentMessage: messageToSend
          }));
          
          console.log('🔧 Injected JS: Message sent successfully');
        } catch (error) {
          console.error('🔧 Injected JS ERROR:', error);
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'debug',
            message: 'ERROR: ' + error.message
          }));
        }
      })();
      true;
    `;
    
    console.log('📝 Injecting JavaScript...');
    webViewRef.current.injectJavaScript(js);
    console.log('✅ JavaScript injected');
  };

  // Expose sendMessage method via ref
  useImperativeHandle(ref, () => ({
    sendMessage
  }));

  /**
   * Fetches a new embed URL from the API and sets up auto-refresh
   */
  const fetchUrl = async () => {
    try {
      setFetchingUrl(true);
      setError(null);
      setWorkbookLoaded(false); // Reset workbook loaded state when fetching new URL
      
      // Pass workbook_id if provided
      const params = workbookId ? { workbook_id: workbookId } : undefined;
      const response = await EmbedUrlService.fetchEmbedUrl(params);
      console.log('🌐 Setting new dashboard URL:', response.url);
      console.log('📚 Workbook ID:', workbookId || 'default');
      setUrl(response.url);
      
      // Clear any existing refresh timeout
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
      
      // Schedule URL refresh before token expires
      const refreshTimeout = EmbedUrlService.getRefreshTimeout(response.expires_at);
      console.log(`URL will refresh in ${Math.floor(refreshTimeout / 1000)} seconds`);
      
      refreshTimeoutRef.current = setTimeout(() => {
        console.log('Refreshing embed URL...');
        fetchUrl();
      }, refreshTimeout);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard URL');
      console.error('Error fetching embed URL:', err);
    } finally {
      setFetchingUrl(false);
    }
  };

  /**
   * Fetch URL on component mount and cleanup on unmount
   */
  useEffect(() => {
    fetchUrl();
    
    return () => {
      // Cleanup: clear the refresh timeout when component unmounts
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, []);

  /**
   * Log state changes for debugging
   */
  useEffect(() => {
    console.log('📊 State update - Loading:', loading, '| Workbook loaded:', workbookLoaded);
  }, [loading, workbookLoaded]);

  const handleLoadStart = () => {
    console.log('📱 WebView started loading...');
    setLoading(true);
    setError(null);
  };

  const handleError = (syntheticEvent: any) => {
    const { nativeEvent } = syntheticEvent;
    setLoading(false);
    setError('Failed to load dashboard. Please check your connection and try again.');
    console.error('WebView error:', nativeEvent);
  };

  const handleHttpError = (syntheticEvent: any) => {
    const { nativeEvent } = syntheticEvent;
    setLoading(false);
    setError(`HTTP Error ${nativeEvent.statusCode}: ${nativeEvent.description}`);
    console.error('WebView HTTP error:', nativeEvent);
  };

  /**
   * Handle postMessage events from the embedded dashboard
   * Listens for 'workbook:loaded' event to hide loading overlay
   */
  const handleMessage = (event: any) => {
    console.log('🔔 ===== POSTMESSAGE RECEIVED =====');
    console.log('📦 Raw message data:', event.nativeEvent.data);

    try {
      const data = JSON.parse(event.nativeEvent.data);
      console.log('✅ Parsed message:', JSON.stringify(data, null, 2));
      console.log('📋 Message type:', data.type);

      // Handle debug messages from our injected JS
      if (data.type === 'debug') {
        console.log('🔧 DEBUG MESSAGE:', data.message);
        if (data.sentMessage) {
          console.log('🔧 Sent message details:', data.sentMessage);
        }
      } else if (data.type === 'workbook:loaded') {
        console.log('🎉 ✅ WORKBOOK LOADED SUCCESSFULLY! 🎉');
        console.log('📊 Workbook variables:', data.workbook?.variables || 'none');
        setWorkbookLoaded(true);
        setLoading(false);
      } else {
        console.log(`ℹ️  Received different message type: ${data.type}`);
      }
    } catch (err) {
      console.error('❌ Error parsing postMessage:', err);
      console.error('❌ Raw data that failed to parse:', event.nativeEvent.data);
    }

    console.log('🔔 ===== END POSTMESSAGE =====\n');
  };

  // Show skeleton loading state while fetching the initial URL
  if (fetchingUrl && !url) {
    return <SkeletonPlaceholder />;
  }

  // Show error if URL fetch failed
  if (error && !url) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>Dashboard Unavailable</Text>
        <Text style={styles.errorMessage}>{error}</Text>
        <Text style={styles.errorSubtext}>
          Please check your internet connection and try again.
        </Text>
      </View>
    );
  }

  // Show WebView once we have a URL
  if (!url) {
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
      <iframe id="sigma-embed" src="${url}" allow="fullscreen"></iframe>
      <script>
        console.log('📱 Iframe wrapper: Initializing...');
        
        // Listen for messages from the Sigma iframe
        window.addEventListener('message', function(event) {
          console.log('📱 Iframe wrapper: Received message from iframe');
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
        
        console.log('📱 Iframe wrapper: Ready and listening for messages');
      </script>
    </body>
    </html>
  `;

  const injectedJavaScript = `
    console.log('📱 Injected JS: WebView ready');
    true;
  `;

  return (
    <View style={styles.container}>
      {loading && (
        <View style={styles.loadingOverlay}>
          <SkeletonPlaceholder />
        </View>
      )}
      
      <WebView
        ref={webViewRef}
        key={url} // Force WebView to reload when URL changes
        source={{ html: htmlContent, baseUrl: 'https://app.sigmacomputing.com' }}
        style={styles.webview}
        onLoadStart={handleLoadStart}
        onMessage={handleMessage}
        onError={handleError}
        onHttpError={handleHttpError}
        userAgent={Config.WEBVIEW.USER_AGENT}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        scalesPageToFit={true}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        // Remove white margins/borders - iOS specific
        contentInset={{ top: 0, bottom: 0, left: 0, right: 0 }}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        automaticallyAdjustsScrollIndicatorInsets={false}
        scrollEnabled={true}
        bounces={false}
        injectedJavaScript={injectedJavaScript}
        // Allow navigation to Sigma domains for embedded content
        originWhitelist={['*']}
        mixedContentMode="always"
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    margin: 0,
    padding: 0,
  },
  webview: {
    flex: 1,
    margin: 0,
    padding: 0,
  },
  loadingContainer: {
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
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background,
    zIndex: 1,
  },
  loadingText: {
    marginTop: spacing.md,
    ...typography.body,
    color: colors.textSecondary,
  },
  // Skeleton styles
  skeletonContainer: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  skeletonHeader: {
    height: 60,
    backgroundColor: colors.border,
    borderRadius: 8,
    marginBottom: spacing.lg,
  },
  skeletonChartsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  skeletonChartLarge: {
    height: 200,
    flex: 2,
    backgroundColor: colors.border,
    borderRadius: 8,
    marginRight: spacing.md,
  },
  skeletonChartSmall: {
    height: 200,
    flex: 1,
    backgroundColor: colors.border,
    borderRadius: 8,
  },
  skeletonChartMedium: {
    height: 180,
    flex: 1,
    backgroundColor: colors.border,
    borderRadius: 8,
    marginHorizontal: spacing.xs,
  },
  skeletonTable: {
    height: 300,
    backgroundColor: colors.border,
    borderRadius: 8,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.background,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.error,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  errorMessage: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  errorSubtext: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
