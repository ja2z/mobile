/**
 * Configuration file for the mobile app
 * Contains URLs and other configurable values
 */

export const Config = {
  // API configuration
  API: {
    EMBED_URL_ENDPOINT: 'https://3x4hwcq05f.execute-api.us-west-2.amazonaws.com/v1/generateSigmaEmbedURL',
    AUTH_BASE_URL: 'https://qx7x0uioo1.execute-api.us-west-2.amazonaws.com/v1/auth',
    ADMIN_BASE_URL: 'https://qx7x0uioo1.execute-api.us-west-2.amazonaws.com/v1/admin',
    MY_BUYS_BASE_URL: 'https://qx7x0uioo1.execute-api.us-west-2.amazonaws.com/v1/my-buys',
  },
  
  // App configuration
  APP_NAME: 'Big Buys Mobile',
  
  // Workbook IDs
  WORKBOOKS: {
    AOP_EXEC_DASHBOARD: '6vzpQFMQkEiBIbnybiwrH3',
    AI_NEWSLETTER: '70xl8hMTdNeqN75p4i4dSG',
    CONVERSATIONAL_AI: '5vuwQqluzlA5gmq9A82vt7',
    OPERATIONS: '285cUkL2a6T21lfRQk4brT',
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
  
  // Authentication configuration
  AUTH: {
    // Magic link type: 'direct' = bigbuys://auth?token=xxx (for Expo Go)
    // 'universal' = https://mobile.bigbuys.io/auth/verify?token=xxx (for production)
    // Default to 'universal' for production builds
    // Override with EXPO_PUBLIC_AUTH_LINK_TYPE=direct in .env.local for Expo Go testing
    LINK_TYPE: (process.env.EXPO_PUBLIC_AUTH_LINK_TYPE || 'universal') as 'direct' | 'universal',
    // Backdoor authentication email (for development/testing)
    // Store in environment variable EXPO_PUBLIC_BACKDOOR_EMAIL
    BACKDOOR_EMAIL: process.env.EXPO_PUBLIC_BACKDOOR_EMAIL || '',
    // Backdoor authentication secret (for development/testing)
    // Store in environment variable EXPO_PUBLIC_BACKDOOR_SECRET
    BACKDOOR_SECRET: process.env.EXPO_PUBLIC_BACKDOOR_SECRET || '',
  },
  
  // Chat configuration
  CHAT: {
    // Variable names in Sigma workbook
    PROMPT_VARIABLE: 'p_bubble_chat_bot_prompt',
    RESPONSE_VARIABLE: 'p_bubble_chat_bot_response',
    SESSION_ID_VARIABLE: 'p_bubble_session_id',
    
    // Timeout for waiting for response from Sigma (in milliseconds)
    RESPONSE_TIMEOUT: 30000, // 30 seconds
  },
} as const;
