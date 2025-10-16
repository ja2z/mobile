import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { Config } from '../constants/Config';
import { EmbedUrlService } from '../services/EmbedUrlService';

interface DashboardViewProps {
  // No longer accepting URL as prop - it will be fetched dynamically
}

/**
 * Dashboard WebView Component
 * Handles loading external dashboard content with proper error handling
 * and automatic URL refresh before token expiry
 */
export const DashboardView: React.FC<DashboardViewProps> = () => {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [workbookLoaded, setWorkbookLoaded] = useState(false); // Track workbook:loaded event
  const [error, setError] = useState<string | null>(null);
  const [fetchingUrl, setFetchingUrl] = useState(true);
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Fetches a new embed URL from the API and sets up auto-refresh
   */
  const fetchUrl = async () => {
    try {
      setFetchingUrl(true);
      setError(null);
      setWorkbookLoaded(false); // Reset workbook loaded state when fetching new URL
      
      const response = await EmbedUrlService.fetchEmbedUrl();
      console.log('🌐 Setting new dashboard URL:', response.url);
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

      if (data.type === 'workbook:loaded') {
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

  // Show loading state while fetching the initial URL
  if (fetchingUrl && !url) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Initializing Dashboard...</Text>
      </View>
    );
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
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading Dashboard...</Text>
        </View>
      )}
      
      <WebView
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
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
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
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666666',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#FFFFFF',
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FF3B30',
    marginBottom: 12,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 16,
    color: '#666666',
    textAlign: 'center',
    marginBottom: 8,
  },
  errorSubtext: {
    fontSize: 14,
    color: '#999999',
    textAlign: 'center',
  },
});
