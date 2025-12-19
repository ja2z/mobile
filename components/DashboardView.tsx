import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Animated, Alert } from 'react-native';
import { WebView } from 'react-native-webview';
import { Config } from '../constants/Config';
import { EmbedUrlService } from '../services/EmbedUrlService';
import { AuthService } from '../services/AuthService';
import { colors, spacing, typography } from '../constants/Theme';

interface DashboardViewProps {
  workbookId?: string; // Optional workbook ID to load specific workbook
  appletId?: string; // Optional applet ID for activity logging
  appletName?: string; // Optional applet name for activity logging
  initialUrl?: string; // Optional: if provided, use this URL directly instead of fetching
  initialJwt?: string; // Optional: JWT token if using initialUrl
  initialPageId?: string; // Optional: page ID for deep linking to specific page
  initialVariables?: Record<string, string>; // Optional: variables/controls for pre-populating filters
  embedPath?: string; // Optional: embed path for constructing the URL (e.g., "sigma-on-sigma/workbook")
}

export interface DashboardViewRef {
  sendMessage: (message: any) => void;
  getUrl: () => string | null;
  getJWT: () => string | null;
  sendChatPrompt: (prompt: string) => void;
  onChatOpen: (callback: (sessionId: string) => void) => void;
  onChatResponse: (callback: (response: any) => void) => void;
  onInventoryVerification: (callback: (data: any) => void) => void;
  onWorkbookLoaded: (callback: () => void) => void;
  queryWorkbookVariables?: () => void;
}

/**
 * Skeleton Placeholder Component
 * Shows animated skeleton while dashboard loads
 */
export const SkeletonPlaceholder: React.FC = () => {
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
export const DashboardView = forwardRef<DashboardViewRef, DashboardViewProps>(({ workbookId, appletId, appletName, initialUrl, initialJwt, initialPageId, initialVariables, embedPath }, ref) => {
  const [url, setUrl] = useState<string | null>(null);
  const [jwt, setJwt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [workbookLoaded, setWorkbookLoaded] = useState(false); // Track workbook:loaded event
  const [error, setError] = useState<string | null>(null);
  const [fetchingUrl, setFetchingUrl] = useState(true);
  const [isAskUrl, setIsAskUrl] = useState(false); // Track if URL is an "ask" URL that doesn't send workbook:loaded
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const webViewRef = useRef<WebView>(null);
  
  /**
   * Check if a URL is an "ask" URL that doesn't send workbook:loaded events
   * Examples:
   * - https://app.sigmacomputing.com/papercrane-embedding-gcp/ask?:jwt=xxx
   * - https://staging.sigmacomputing.io/papercrane-embedding-gcp/ask?:jwt=xxx
   */
  const checkIfAskUrl = (urlToCheck: string | null): boolean => {
    if (!urlToCheck) return false;
    // Check if URL contains "/ask" or "/ask?" in the path
    return /\/ask(\?|$)/.test(urlToCheck);
  };
  
  // Log props received by DashboardView
  useEffect(() => {
    console.log('📊 ===== DASHBOARD VIEW PROPS =====');
    console.log('📊 Received props:');
    console.log('📊   workbookId:', workbookId);
    console.log('📊   appletId:', appletId);
    console.log('📊   appletName:', appletName);
    console.log('📊   initialUrl:', initialUrl);
    console.log('📊   initialJwt:', initialJwt ? 'present' : 'missing');
    console.log('📊   initialPageId:', initialPageId);
    console.log('📊   initialVariables:', JSON.stringify(initialVariables, null, 2));
    console.log('📊   embedPath:', embedPath);
    console.log('📊 ===== END DASHBOARD VIEW PROPS =====');
  }, [workbookId, appletId, appletName, initialUrl, initialJwt, initialPageId, initialVariables, embedPath]);
  
  // Chat-related callback refs
  const chatOpenCallbackRef = useRef<((sessionId: string) => void) | null>(null);
  const chatResponseCallbackRef = useRef<((response: any) => void) | null>(null);
  
  // Inventory verification callback ref
  const inventoryVerificationCallbackRef = useRef<((data: any) => void) | null>(null);
  
  // Workbook loaded callback ref
  const workbookLoadedCallbackRef = useRef<(() => void) | null>(null);

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
    
    // Note: iOS WKWebView requires the injected script to return a primitive value
    // Using void(0) ensures we return undefined which is a valid primitive
    const js = `(function(){try{var iframe=document.getElementById('sigma-embed');if(iframe&&iframe.contentWindow){iframe.contentWindow.postMessage(${messageStr},'https://app.sigmacomputing.com');}}catch(e){}})();void(0);`;
    
    console.log('📝 Injecting JavaScript...');
    webViewRef.current.injectJavaScript(js);
    console.log('✅ JavaScript injected');
  };

  /**
   * Send a chat prompt to the Sigma workbook
   * Updates the p_bubble_chat_bot_prompt variable which triggers the onLoad plugin
   */
  const sendChatPrompt = (prompt: string) => {
    console.log('🚀 Sending chat prompt to Sigma:', prompt);
    
    const message = {
      type: 'workbook:variables:update',
      variables: {
        'p_bubble_chat_bot_prompt': prompt,
      },
    };
    
    sendMessage(message);
  };

  /**
   * Register callback for when chat should open (sessionId change)
   */
  const onChatOpen = (callback: (sessionId: string) => void) => {
    chatOpenCallbackRef.current = callback;
  };

  /**
   * Register callback for when chat response is received
   */
  const onChatResponse = (callback: (response: any) => void) => {
    chatResponseCallbackRef.current = callback;
  };

  /**
   * Register callback for inventory verification requests
   */
  const onInventoryVerification = (callback: (data: any) => void) => {
    inventoryVerificationCallbackRef.current = callback;
  };

  /**
   * Query workbook variables for debugging
   */
  const queryWorkbookVariables = () => {
    console.log('🔍 Querying workbook variables using workbook:variables:list...');
    sendMessage({
      type: 'workbook:variables:list'
    });
  };

  /**
   * Register callback for when workbook loads
   */
  const onWorkbookLoaded = (callback: () => void) => {
    workbookLoadedCallbackRef.current = callback;
  };

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    sendMessage,
    getUrl: () => url,
    getJWT: () => jwt,
    sendChatPrompt,
    onChatOpen,
    onChatResponse,
    onInventoryVerification,
    onWorkbookLoaded,
    queryWorkbookVariables,
  }));

  /**
   * Fetches a new embed URL from the API and sets up auto-refresh
   */
  const fetchUrl = async () => {
    try {
      setFetchingUrl(true);
      setError(null);
      setWorkbookLoaded(false); // Reset workbook loaded state when fetching new URL
      
      // Get user's email from session (gracefully handle errors)
      let userEmail: string | undefined;
      try {
        const session = await AuthService.getSession();
        userEmail = session?.user?.email;
        if (userEmail) {
          console.log('👤 Using user email:', userEmail);
        } else {
          console.warn('⚠️ No user email found in session, lambda will use default');
        }
      } catch (sessionError) {
        console.warn('⚠️ Error retrieving session (proceeding without email):', sessionError);
        // Continue without email - lambda will use default
      }
      
      // Build params object with workbook_id, user_email, applet info, page_id, variables, and embed_path
      const params: { workbook_id?: string; user_email?: string; applet_id?: string; applet_name?: string; page_id?: string; variables?: Record<string, string>; embed_path?: string } = {};
      if (workbookId) {
        params.workbook_id = workbookId;
      }
      if (userEmail) {
        params.user_email = userEmail;
      }
      if (appletId) {
        params.applet_id = appletId;
      }
      if (appletName) {
        params.applet_name = appletName;
      }
      if (initialPageId) {
        params.page_id = initialPageId;
        console.log('📊 Added page_id to params:', initialPageId);
      } else {
        console.log('📊 No initialPageId provided');
      }
      if (initialVariables) {
        params.variables = initialVariables;
        console.log('📊 Added variables to params:', JSON.stringify(initialVariables, null, 2));
      } else {
        console.log('📊 No initialVariables provided');
      }
      if (embedPath) {
        params.embed_path = embedPath;
        console.log('📊 Added embed_path to params:', embedPath);
      } else {
        console.log('📊 No embedPath provided');
      }
      
      console.log('📤 ===== CALLING EMBED URL API =====');
      console.log('📤 Full params object:', JSON.stringify(params, null, 2));
      console.log('📤 ===== END CALLING EMBED URL API =====');
      const response = await EmbedUrlService.fetchEmbedUrl(params);
      console.log('🌐 Setting new dashboard URL:', response.url);
      console.log('📚 Workbook ID:', workbookId || 'default');
      const askUrl = checkIfAskUrl(response.url);
      setIsAskUrl(askUrl);
      if (askUrl) {
        console.log('📱 Detected "ask" URL - will not wait for workbook:loaded event');
      }
      setUrl(response.url);
      setJwt(response.jwt || null);
      
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
      
    } catch (err: any) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load dashboard URL';
      
      // Handle expiration errors
      if (err.isExpirationError) {
        Alert.alert(
          'Account Expired',
          errorMessage,
          [{ text: 'OK' }]
        );
        setError(errorMessage);
        return;
      }
      
      // Log detailed error information for debugging
      if (err instanceof Error) {
        console.error('❌ Error fetching embed URL:', errorMessage);
        console.error('❌ Error name:', err.name);
        console.error('❌ Error stack:', err.stack);
      } else {
        console.error('❌ Error fetching embed URL:', errorMessage);
        console.error('❌ Error object:', String(err));
      }
      
      setError(errorMessage);
    } finally {
      setFetchingUrl(false);
    }
  };

  /**
   * Fetch URL on component mount and cleanup on unmount
   * Or use initialUrl if provided
   */
  useEffect(() => {
    if (initialUrl) {
      // Use provided URL directly
      console.log('📱 Using initialUrl:', initialUrl);
      const askUrl = checkIfAskUrl(initialUrl);
      setIsAskUrl(askUrl);
      if (askUrl) {
        console.log('📱 Detected "ask" URL - will not wait for workbook:loaded event');
      }
      setUrl(initialUrl);
      setJwt(initialJwt || null);
      setFetchingUrl(false);
      setLoading(true); // Will be set to false when workbook:loaded is received (or onLoadEnd for ask URLs)
    } else {
      // Fetch URL from API
      fetchUrl();
    }
    
    return () => {
      // Cleanup: clear the refresh timeout when component unmounts
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, [initialUrl, initialJwt]);

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

  const handleLoadEnd = () => {
    console.log('📱 WebView finished loading...');
    // For "ask" URLs, don't wait for workbook:loaded event - hide loading immediately
    if (isAskUrl) {
      console.log('📱 "ask" URL detected - hiding loading overlay without waiting for workbook:loaded');
      setLoading(false);
      setWorkbookLoaded(true); // Set to true so parent components know content is ready
      
      // Notify parent component that content has loaded (even though it's not a workbook)
      if (workbookLoadedCallbackRef.current) {
        console.log('📊 Triggering workbook loaded callback for ask URL');
        workbookLoadedCallbackRef.current();
      }
    }
    // For regular URLs, we still wait for workbook:loaded event in handleMessage
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
   * Also handles chat-related messages (sessionId changes, chat responses)
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
        if (data.workbook?.variables) {
          console.log('📊 Available variable names:', Object.keys(data.workbook.variables));
        }
        setWorkbookLoaded(true);
        setLoading(false);
        
        // Notify parent component that workbook has loaded
        if (workbookLoadedCallbackRef.current) {
          console.log('📊 Triggering workbook loaded callback');
          workbookLoadedCallbackRef.current();
        }
      } else if (data.type === 'workbook:variables:current') {
        console.log('🔍 ===== WORKBOOK VARIABLES LIST RESPONSE =====');
        console.log('📋 Full response data:', JSON.stringify(data, null, 2));
        if (data.variables) {
          const varNames = Object.keys(data.variables);
          console.log('📋 Total variables:', varNames.length);
          console.log('📋 Variable names:', varNames);
          console.log('📋 Variable values:', JSON.stringify(data.variables, null, 2));
          console.log('📋 Looking for inventory variables...');
          console.log('📋 p_stockroom_qty exists?', varNames.includes('p_stockroom_qty'));
          console.log('📋 p_transfer_qty exists?', varNames.includes('p_transfer_qty'));
        }
        console.log('🔍 ===== END VARIABLES LIST =====\n');
      } else if (data.type === 'chat:open') {
        // Handle sessionId change - open native chat modal
        console.log('💬 Chat open requested with sessionId:', data.sessionId);
        if (chatOpenCallbackRef.current && data.sessionId) {
          chatOpenCallbackRef.current(data.sessionId);
        }
      } else if (data.type === 'chat:response') {
        // Handle chat response from Sigma workbook
        console.log('💬 Chat response received:', data.message);
        if (chatResponseCallbackRef.current && data.message) {
          chatResponseCallbackRef.current(data.message);
        }
      } else if (data.type === 'action:outbound') {
        // Handle outbound action events from Sigma workbook
        console.log('📦 Action outbound event received:', data);
        console.log('📦 Event name:', data.name);
        console.log('📦 Event values:', data.values);
        
        // Check if this is an inventory verification event
        if (data.name === 'inventory:verify' || data.name === 'Event-Name') {
          console.log('📦 Triggering inventory verification');
          if (inventoryVerificationCallbackRef.current && data.values) {
            inventoryVerificationCallbackRef.current(data.values);
          }
        }
      } else if (data.type === 'workbook:variables:onchange') {
        // Handle variable changes - check for sessionId and chat response
        console.log('📊 Variable changes detected:', data);
        
        const variables = data.workbook?.variables || {};
        
        // Check for sessionId change (opens chat modal)
        if (variables['p_bubble_session_id']) {
          console.log('💬 SessionId changed to:', variables['p_bubble_session_id']);
          if (chatOpenCallbackRef.current) {
            chatOpenCallbackRef.current(String(variables['p_bubble_session_id']));
          }
        }
        
        // Check for chat response (AI message)
        if (variables['p_bubble_chat_bot_response']) {
          const rawContent = String(variables['p_bubble_chat_bot_response']);
          console.log('💬 Chat response received from variable (RAW):', rawContent);
          console.log('💬 First 200 chars:', rawContent.substring(0, 200));
          console.log('💬 Contains %:', rawContent.includes('%'));
          
          if (chatResponseCallbackRef.current) {
            // Convert to the expected message format
            const responseMessage = {
              id: `assistant-${Date.now()}`,
              content: rawContent,
              sender: 'assistant',
              timestamp: new Date().toISOString(),
            };
            chatResponseCallbackRef.current(responseMessage);
          }
        }
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
        onLoadEnd={handleLoadEnd}
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
