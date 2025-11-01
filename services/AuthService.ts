import * as SecureStore from 'expo-secure-store';
import * as Device from 'expo-device';
import { Config } from '../constants/Config';

const AUTH_BASE_URL = Config.API.AUTH_BASE_URL;
const JWT_STORAGE_KEY = 'auth_jwt';
const USER_STORAGE_KEY = 'auth_user';

export interface User {
  email: string;
  userId: string;
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
   */
  static async requestMagicLink(email: string): Promise<void> {
    const response = await fetch(`${AUTH_BASE_URL}/request-magic-link`, {
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
  }

  /**
   * Verify magic link token and get session JWT
   */
  static async verifyMagicLink(token: string, dashboardId?: string): Promise<AuthSession> {
    const deviceId = await Device.modelId || 'unknown';
    
    const response = await fetch(`${AUTH_BASE_URL}/verify-magic-link`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token, deviceId }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || data.error || 'Failed to verify magic link');
    }

    // Store session
    await this.saveSession({
      jwt: data.sessionToken,
      user: {
        email: data.email,
        userId: data.userId,
      },
      expiresAt: data.expiresAt,
    });

    return {
      jwt: data.sessionToken,
      user: {
        email: data.email,
        userId: data.userId,
      },
      expiresAt: data.expiresAt,
    };
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
      
      // Check if expired (basic check - could decode JWT for more accurate check)
      const now = Math.floor(Date.now() / 1000);
      const userObj = JSON.parse(userJson);
      // For now, assume session is valid if JWT exists
      // You could decode JWT to check expiration more accurately
      
      return {
        jwt,
        user,
        expiresAt: 0, // Would decode JWT for actual expiry
      };
    } catch (error) {
      console.error('Error getting session:', error);
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
}
