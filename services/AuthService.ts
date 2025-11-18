import * as SecureStore from 'expo-secure-store';
import * as Device from 'expo-device';
import { Config } from '../constants/Config';

const AUTH_BASE_URL = Config.API.AUTH_BASE_URL;
const JWT_STORAGE_KEY = 'auth_jwt';
const USER_STORAGE_KEY = 'auth_user';

export interface User {
  email: string;
  userId: string;
  role?: 'basic' | 'admin';
}

export interface AuthSession {
  jwt: string;
  user: User;
  expiresAt: number;
}

/**
 * Authentication Service
 * Handles magic link requests, token verification, and session management
 */
export class AuthService {
  /**
   * Request a magic link via email
   * Automatically uses linkType from Config (based on EXPO_PUBLIC_AUTH_LINK_TYPE env var)
   */
  static async requestMagicLink(email: string): Promise<void> {
    const response = await fetch(`${AUTH_BASE_URL}/request-magic-link`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        email,
        linkType: Config.AUTH.LINK_TYPE // 'direct' for Expo Go, 'universal' for production
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || data.error || 'Failed to send magic link');
    }
  }

  /**
   * Verify magic link token and get session JWT
   */
  static async verifyMagicLink(token: string): Promise<AuthSession> {
    // Get device ID - create a persistent identifier for this device
    let deviceId = 'unknown';
    try {
      // Try to get or create a persistent device ID
      const storedDeviceId = await SecureStore.getItemAsync('device_id');
      if (storedDeviceId) {
        deviceId = storedDeviceId;
      } else {
        // Generate a new device ID based on device info
        const platform = Device.osName || 'unknown';
        const deviceName = Device.deviceName || 'unknown';
        const deviceIdBase = `${platform}_${deviceName}_${Date.now()}`;
        deviceId = deviceIdBase.replace(/\s+/g, '_').toLowerCase();
        // Store it for future use
        await SecureStore.setItemAsync('device_id', deviceId);
      }
    } catch (error) {
      console.warn('Could not get device ID:', error);
      // Fallback: generate a simple ID
      deviceId = `dev_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    }
    
    const response = await fetch(`${AUTH_BASE_URL}/verify-magic-link`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token, deviceId }),
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMessage = data.message || data.error || 'Failed to verify magic link';
      const error = new Error(errorMessage) as any;
      
      // Add error type based on API response
      if (data.error === 'Token expired' || data.error === 'Invalid or expired token') {
        error.isTokenExpired = true;
        error.errorType = data.error === 'Token expired' ? 'expired' : 'invalid';
      } else if (data.error === 'Token already used') {
        error.isTokenExpired = true;
        error.errorType = 'used';
      }
      
      // Extract email from error response if available
      if (data.email) {
        error.email = data.email;
      }
      
      throw error;
    }

    // Lambda returns: { success: true, token: "...", expiresAt: ..., user: { userId, email, role } }
    const sessionToken = data.token || data.sessionToken; // Support both field names
    const userEmail = data.user?.email || data.email;
    const userId = data.user?.userId || data.userId;
    const userRole = data.user?.role || 'basic';

    if (!sessionToken || !userEmail || !userId) {
      throw new Error('Invalid response from server: missing required fields');
    }

    // Store session
    await this.saveSession({
      jwt: sessionToken,
      user: {
        email: userEmail,
        userId: userId,
        role: userRole as 'basic' | 'admin',
      },
      expiresAt: data.expiresAt || 0,
    });

    return {
      jwt: sessionToken,
      user: {
        email: userEmail,
        userId: userId,
        role: userRole as 'basic' | 'admin',
      },
      expiresAt: data.expiresAt || 0,
    };
  }

  /**
   * Authenticate via backdoor (for development/testing)
   * Directly authenticates without requiring a magic link
   */
  static async authenticateBackdoor(email: string, secret: string): Promise<AuthSession> {
    // Get device ID - create a persistent identifier for this device
    let deviceId = 'unknown';
    try {
      // Try to get or create a persistent device ID
      const storedDeviceId = await SecureStore.getItemAsync('device_id');
      if (storedDeviceId) {
        deviceId = storedDeviceId;
      } else {
        // Generate a new device ID based on device info
        const platform = Device.osName || 'unknown';
        const deviceName = Device.deviceName || 'unknown';
        const deviceIdBase = `${platform}_${deviceName}_${Date.now()}`;
        deviceId = deviceIdBase.replace(/\s+/g, '_').toLowerCase();
        // Store it for future use
        await SecureStore.setItemAsync('device_id', deviceId);
      }
    } catch (error) {
      console.warn('Could not get device ID:', error);
      // Fallback: generate a simple ID
      deviceId = `dev_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    }
    
    const url = `${AUTH_BASE_URL}/authenticate-backdoor`;
    console.log('[AuthService.authenticateBackdoor] Request URL:', url);
    console.log('[AuthService.authenticateBackdoor] Request body:', { email, deviceId, secret: secret ? `${secret.substring(0, 4)}...` : 'missing' });
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, deviceId, secret }),
    });

    console.log('[AuthService.authenticateBackdoor] Response status:', response.status, response.statusText);
    
    // Try to parse JSON, but handle errors gracefully
    let data: any = {};
    const responseText = await response.text();
    console.log('[AuthService.authenticateBackdoor] Raw response:', responseText);
    
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error('[AuthService.authenticateBackdoor] Failed to parse JSON:', parseError);
      console.error('[AuthService.authenticateBackdoor] Response text:', responseText);
      throw new Error(`Invalid response from server (${response.status}): ${responseText.substring(0, 200)}`);
    }

    if (!response.ok) {
      // Provide more specific error messages based on API response
      let errorMessage = data.message || data.error || 'Failed to authenticate via backdoor';
      
      // Log the full error for debugging
      console.error('[AuthService.authenticateBackdoor] API error:', {
        status: response.status,
        statusText: response.statusText,
        url,
        error: data.error,
        message: data.message,
        fullResponse: data,
        rawResponse: responseText,
      });
      
      throw new Error(errorMessage);
    }

    // Lambda returns: { success: true, token: "...", expiresAt: ..., user: { userId, email, role } }
    const sessionToken = data.token || data.sessionToken;
    const userEmail = data.user?.email || data.email;
    const userId = data.user?.userId || data.userId;
    const userRole = data.user?.role || 'basic';

    if (!sessionToken || !userEmail || !userId) {
      throw new Error('Invalid response from server: missing required fields');
    }

    // Store session
    await this.saveSession({
      jwt: sessionToken,
      user: {
        email: userEmail,
        userId: userId,
        role: userRole as 'basic' | 'admin',
      },
      expiresAt: data.expiresAt || 0,
    });

    return {
      jwt: sessionToken,
      user: {
        email: userEmail,
        userId: userId,
        role: userRole as 'basic' | 'admin',
      },
      expiresAt: data.expiresAt || 0,
    };
  }

  /**
   * Decode JWT payload (without verification - just for reading data)
   */
  static decodeJWT(token: string): any | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return null;
      }

      const payload = parts[1];
      // Base64 decode the payload
      const decoded = JSON.parse(
        atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
      );

      return decoded;
    } catch (error) {
      console.error('Error decoding JWT:', error);
      return null;
    }
  }

  /**
   * Get current session if authenticated
   */
  static async getSession(): Promise<AuthSession | null> {
    try {
      const jwt = await SecureStore.getItemAsync(JWT_STORAGE_KEY);
      const userJson = await SecureStore.getItemAsync(USER_STORAGE_KEY);

      if (!jwt || !userJson) {
        return null;
      }

      const user = JSON.parse(userJson);
      
      // Decode JWT to get expiration, issued at dates, and role
      const decodedJWT = this.decodeJWT(jwt);
      const expiresAt = decodedJWT?.exp || 0;
      
      // Update user role from JWT if not in stored user (for backward compatibility)
      if (!user.role && decodedJWT?.role) {
        user.role = decodedJWT.role;
      }
      
      return {
        jwt,
        user: {
          ...user,
          role: user.role || decodedJWT?.role || 'basic',
        },
        expiresAt,
      };
    } catch (error) {
      console.error('Error getting session:', error);
      return null;
    }
  }

  /**
   * Get session start date (issued at time) from JWT
   */
  static async getSessionStartDate(): Promise<Date | null> {
    try {
      const jwt = await SecureStore.getItemAsync(JWT_STORAGE_KEY);
      if (!jwt) {
        return null;
      }

      const decodedJWT = this.decodeJWT(jwt);
      if (!decodedJWT?.iat) {
        return null;
      }

      // iat is in seconds, convert to milliseconds for Date
      return new Date(decodedJWT.iat * 1000);
    } catch (error) {
      console.error('Error getting session start date:', error);
      return null;
    }
  }

  /**
   * Save session to secure storage
   */
  private static async saveSession(session: AuthSession): Promise<void> {
    await SecureStore.setItemAsync(JWT_STORAGE_KEY, session.jwt);
    await SecureStore.setItemAsync(USER_STORAGE_KEY, JSON.stringify(session.user));
  }

  /**
   * Clear session (logout)
   */
  static async clearSession(): Promise<void> {
    await SecureStore.deleteItemAsync(JWT_STORAGE_KEY);
    await SecureStore.deleteItemAsync(USER_STORAGE_KEY);
  }

  /**
   * Check if user is authenticated
   */
  static async isAuthenticated(): Promise<boolean> {
    const session = await this.getSession();
    return session !== null;
  }

  /**
   * Get user role from JWT
   */
  static async getUserRole(): Promise<'basic' | 'admin' | null> {
    try {
      const jwt = await SecureStore.getItemAsync(JWT_STORAGE_KEY);
      if (!jwt) {
        return null;
      }

      const decodedJWT = this.decodeJWT(jwt);
      const role = decodedJWT?.role;
      
      if (role === 'basic' || role === 'admin') {
        return role;
      }
      
      return 'basic'; // Default to basic
    } catch (error) {
      console.error('Error getting user role:', error);
      return null;
    }
  }

  /**
   * Check if user is admin
   */
  static async isAdmin(): Promise<boolean> {
    const role = await this.getUserRole();
    return role === 'admin';
  }

  /**
   * Handle API response and check for expiration errors
   * Throws error if account is expired or deactivated
   * This should be caught by the caller to show an alert
   */
  static async handleApiResponse(response: Response): Promise<Response> {
    if (!response.ok) {
      // Clone response to read body without consuming it
      const clonedResponse = response.clone();
      const data = await clonedResponse.json().catch(() => ({}));
      
      // Check for expiration or deactivation errors
      if (response.status === 403 && (data.error === 'Account expired' || data.error === 'Account deactivated')) {
        // Clear session
        await this.clearSession();
        // Throw specific error that can be caught and shown as alert
        const errorMessage = data.message || data.error || 'Your account has expired. You can no longer use the app.';
        const error = new Error(errorMessage) as any;
        error.isExpirationError = true;
        throw error;
      }
      
      // Re-throw with original error
      throw new Error(data.message || data.error || `API error: ${response.status}`);
    }
    
    return response;
  }
}
