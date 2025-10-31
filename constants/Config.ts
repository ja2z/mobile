/**
 * Configuration file for the mobile app
 * Contains URLs and other configurable values
 */

export const Config = {
  // API configuration
  API: {
    EMBED_URL_ENDPOINT: 'https://3x4hwcq05f.execute-api.us-west-2.amazonaws.com/v1/generateSigmaEmbedURL',
  },
  
  // App configuration
  APP_NAME: 'Big Buys Mobile',
  
  // Workbook IDs
  WORKBOOKS: {
    AOP_EXEC_DASHBOARD: '6vzpQFMQkEiBIbnybiwrH3',
    AI_NEWSLETTER: '70xl8hMTdNeqN75p4i4dSG',
  },
  
  // Navigation configuration
  NAVIGATION: {
    HEADER_HEIGHT: 60,
    TAB_BAR_HEIGHT: 80,
  },
  
  // WebView configuration
  WEBVIEW: {
    TIMEOUT: 30000, // 30 seconds
    USER_AGENT: 'MobileDashboard/1.0',
    // Refresh the embed URL 5 minutes before expiry to avoid interruptions
    REFRESH_BUFFER_SECONDS: 300,
  },
} as const;
