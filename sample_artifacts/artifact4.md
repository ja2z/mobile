/**
 * Authentication Service
 * Handles user authentication, token storage, and session management
 */

import * as SecureStore from 'expo-secure-store';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { Config } from '../constants/Config';

// Storage keys
const STORAGE_KEYS = {
  SESSION_TOKEN: 'auth_session_token',
  USER_DATA: 'auth_user_data',
  DEVICE_ID: 'auth_device_id',
};

export interface User {
  userId: string;
  email: string;
}

export interface AuthSession {
  token: string;
  expiresAt: number;
  user: User;
}

/**
 * Authentication Service Class
 */
export class AuthService {
  private static instance: AuthService;
  private sessionCache: AuthSession | null = null;

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  /**
   * Request magic link via email (self-service registration)
   */
  async requestMagicLink(email: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch(`${Config.API.AUTH_BASE_URL}/request-magic-link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to send magic link');
      }

      return {
        success: true,
        message: data.message || 'Magic link sent to your email',
      };
    } catch (error) {
      console.error('Error requesting magic link:', error);
      throw error;
    }
  }

  /**
   * Verify magic link token and establish session
   */
  async verifyMagicLink(token: string, dashboardId?: string): Promise<AuthSession> {
    try {
      const deviceId = await this.getOrCreateDeviceId();

      const response = await fetch(`${Config.API.AUTH_BASE_URL}/verify-magic-link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token, deviceId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Invalid or expired token');
      }

      // Store session data
      const session: AuthSession = {
        token: data.token,
        expiresAt: data.expiresAt,
        user: data.user,
      };

      await this.saveSession(session);
      this.sessionCache = session;

      return session;
    } catch (error) {
      console.error('Error verifying magic link:', error);
      throw error;
    }
  }

  /**
   * Refresh session token before expiry
   */
  async refreshToken(): Promise<AuthSession> {
    try {
      const currentSession = await this.getSession();
      
      if (!currentSession) {
        throw new Error('No active session to refresh');
      }

      const response = await fetch(`${Config.API.AUTH_BASE_URL}/refresh-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token: currentSession.token }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to refresh token');
      }

      // Update session with new token
      const newSession: AuthSession = {
        token: data.token,
        expiresAt: data.expiresAt,
        user: currentSession.user,
      };

      await this.saveSession(newSession);
      this.sessionCache = newSession;

      return newSession;
    } catch (error) {
      console.error('Error refreshing token:', error);
      throw error;
    }
  }

  /**
   * Get current session (from cache or storage)
   */
  async getSession(): Promise<AuthSession | null> {
    // Return cached session if available
    if (this.sessionCache) {
      return this.sessionCache;
    }

    try {
      const tokenStr = await SecureStore.getItemAsync(STORAGE_KEYS.SESSION_TOKEN);
      const userStr = await SecureStore.getItemAsync(STORAGE_KEYS.USER_DATA);

      if (!tokenStr || !userStr) {
        return null;
      }

      const sessionData = JSON.parse(tokenStr);
      const userData = JSON.parse(userStr);

      const session: AuthSession = {
        token: sessionData.token,
        expiresAt: sessionData.expiresAt,
        user: userData,
      };

      // Check if token is expired
      const now = Math.floor(Date.now() / 1000);
      if (now >= session.expiresAt) {
        console.log('Session expired, clearing...');
        await this.clearSession();
        return null;
      }

      // Check if token is close to expiry (within 7 days) and auto-refresh
      const daysUntilExpiry = (session.expiresAt - now) / (24 * 60 * 60);
      if (daysUntilExpiry < 7) {
        console.log('Session close to expiry, auto-refreshing...');
        try {
          return await this.refreshToken();
        } catch (error) {
          console.error('Auto-refresh failed:', error);
          // Return current session anyway, it's still valid
        }
      }

      this.sessionCache = session;
      return session;
    } catch (error) {
      console.error('Error getting session:', error);
      return null;
    }
  }

  /**
   * Check if user is authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    const session = await this.getSession();
    return session !== null;
  }

  /**
   * Get current user
   */
  async getCurrentUser(): Promise<User | null> {
    const session = await this.getSession();
    return session?.user || null;
  }

  /**
   * Get session token for API calls
   */
  async getSessionToken(): Promise<string | null> {
    const session = await this.getSession();
    return session?.token || null;
  }

  /**
   * Sign out and clear session
   */
  async signOut(): Promise<void> {
    await this.clearSession();
    this.sessionCache = null;
    console.log('User signed out successfully');
  }

  /**
   * Save session to secure storage
   */
  private async saveSession(session: AuthSession): Promise<void> {
    try {
      await SecureStore.setItemAsync(
        STORAGE_KEYS.SESSION_TOKEN,
        JSON.stringify({
          token: session.token,
          expiresAt: session.expiresAt,
        })
      );

      await SecureStore.setItemAsync(
        STORAGE_KEYS.USER_DATA,
        JSON.stringify(session.user)
      );

      console.log('Session saved successfully');
    } catch (error) {
      console.error('Error saving session:', error);
      throw new Error('Failed to save session');
    }
  }

  /**
   * Clear session from storage
   */
  private async clearSession(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(STORAGE_KEYS.SESSION_TOKEN);
      await SecureStore.deleteItemAsync(STORAGE_KEYS.USER_DATA);
      console.log('Session cleared successfully');
    } catch (error) {
      console.error('Error clearing session:', error);
    }
  }

  /**
   * Get or create unique device ID
   */
  private async getOrCreateDeviceId(): Promise<string> {
    try {
      // Try to get existing device ID
      let deviceId = await SecureStore.getItemAsync(STORAGE_KEYS.DEVICE_ID);

      if (!deviceId) {
        // Generate new device ID
        deviceId = this.generateDeviceId();
        await SecureStore.setItemAsync(STORAGE_KEYS.DEVICE_ID, deviceId);
      }

      return deviceId;
    } catch (error) {
      console.error('Error with device ID:', error);
      // Fallback to generating a new one each time if storage fails
      return this.generateDeviceId();
    }
  }

  /**
   * Generate unique device ID
   */
  private generateDeviceId(): string {
    const platform = Platform.OS;
    const deviceName = Device.deviceName || 'unknown';
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    
    return `dev_${platform}_${deviceName}_${timestamp}_${random}`.replace(/\s/g, '_');
  }

  /**
   * Decode JWT payload (without verification - just for reading data)
   */
  decodeJWT(token: string): any {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid JWT format');
      }

      const payload = parts[1];
      const decoded = JSON.parse(
        Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()
      );

      return decoded;
    } catch (error) {
      console.error('Error decoding JWT:', error);
      return null;
    }
  }

  /**
   * Get time until token expires (in seconds)
   */
  async getTimeUntilExpiry(): Promise<number | null> {
    const session = await this.getSession();
    if (!session) {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    return session.expiresAt - now;
  }

  /**
   * Check if session will expire soon (within specified seconds)
   */
  async willExpireSoon(seconds: number = 7 * 24 * 60 * 60): Promise<boolean> {
    const timeUntilExpiry = await this.getTimeUntilExpiry();
    if (timeUntilExpiry === null) {
      return false;
    }
    return timeUntilExpiry < seconds;
  }
}

// Export singleton instance
export default AuthService.getInstance();