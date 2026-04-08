import * as SecureStore from 'expo-secure-store';
import * as Device from 'expo-device';
import { Config } from '../constants/Config';

const AUTH_BASE_URL = Config.API.AUTH_BASE_URL;
const PHONE_BASE_URL = Config.API.PHONE_BASE_URL;
const JWT_STORAGE_KEY = 'auth_jwt';
const USER_STORAGE_KEY = 'auth_user';
const LOGIN_INSTANCE_KEY = 'current_login_instance_id';
const NUDGE_DISMISSED_KEY = 'phone_nudge_dismissed_for_instance';

export interface User {
  email: string;
  userId: string;
  role?: 'basic' | 'admin';
}

export interface UserProfile {
  userId: string;
  email: string;
  role: string;
  phoneNumber: string | null;
  /** Unix seconds when phone was last set via SMS verify; used for change cooldown */
  phoneNumberVerifiedAt: number | null;
  expirationDate: number | null;
  isDeactivated: boolean;
  firstName?: string | null;
  lastName?: string | null;
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
   * @param email - The email address to send the magic link to
   * @param usernameHash - Optional SHA-256 hash of the username (for @sigmacomputing.com emails to detect backdoor users)
   */
  static async requestMagicLink(email: string, usernameHash?: string): Promise<void> {
    const requestBody: any = { 
      email,
      linkType: Config.AUTH.LINK_TYPE // 'direct' for Expo Go, 'universal' for production
    };
    
    // Include usernameHash if provided (for @sigmacomputing.com emails)
    if (usernameHash) {
      requestBody.usernameHash = usernameHash;
    }
    
    const response = await fetch(`${AUTH_BASE_URL}/request-magic-link`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    // Check if server detected backdoor user (even on success - server returns 200 with requiresBackdoorAuth)
    if (data.requiresBackdoorAuth === true) {
      const error = new Error('Backdoor authentication required') as any;
      error.requiresBackdoorAuth = true;
      throw error;
    }

    if (!response.ok) {
      throw new Error(data.message || data.error || 'Failed to send magic link');
    }
  }

  /**
   * True when first or last name is missing (trimmed); used to gate CollectName for non-backdoor users.
   */
  static needsProfileName(profile: UserProfile | null): boolean {
    if (!profile) return false;
    const f = (profile.firstName ?? '').trim();
    const l = (profile.lastName ?? '').trim();
    return f.length === 0 || l.length === 0;
  }

  /**
   * Verify magic link token and get session JWT
   */
  static async verifyMagicLink(token: string): Promise<AuthSession & { isNewRegistration?: boolean }> {
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

    // Set a new login instance ID so the phone nudge shows on this login (not for backdoor)
    await this.setNewLoginInstance();

    return {
      jwt: sessionToken,
      user: {
        email: userEmail,
        userId: userId,
        role: userRole as 'basic' | 'admin',
      },
      expiresAt: data.expiresAt || 0,
      isNewRegistration: data.isNewRegistration === true,
    };
  }

  /**
   * Authenticate via backdoor (for development/testing)
   * Directly authenticates without requiring a magic link
   * @param email - The backdoor email (e.g., hash@sigmacomputing.com)
   * @param hash - SHA-256 hash of the username (computed on client)
   * @param passwordHash - Optional SHA-256 hash of the password (computed on client)
   */
  static async authenticateBackdoor(email: string, hash: string, passwordHash?: string): Promise<AuthSession> {
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
    console.log('[AuthService.authenticateBackdoor] Request body:', { 
      email, 
      hash: hash.substring(0, 16) + '...', 
      passwordHash: passwordHash ? passwordHash.substring(0, 16) + '...' : undefined,
      deviceId 
    });
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, hash, deviceId, passwordHash }),
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

    // Check if password is required (step 1 of two-step validation)
    if (data.requiresPassword === true) {
      const error = new Error('Password required') as any;
      error.requiresPassword = true;
      throw error;
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

      // If the JWT has expired, treat as unauthenticated and clear stored credentials
      const now = Math.floor(Date.now() / 1000);
      if (expiresAt && now >= expiresAt) {
        console.log('[AuthService] Session JWT is expired, clearing session');
        await this.clearSession();
        return null;
      }
      
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
    await this.clearLoginInstance();
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

  // ─── /auth/me ────────────────────────────────────────────────────────────────

  /**
   * Fetch the authenticated user's profile from Postgres via GET /auth/me.
   * Returns null if not authenticated or request fails.
   */
  static async getMe(): Promise<UserProfile | null> {
    const session = await this.getSession();
    if (!session) return null;

    try {
      const response = await fetch(`${AUTH_BASE_URL}/me`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.jwt}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) return null;
      const data = await response.json();
      return data as UserProfile;
    } catch (error) {
      console.error('[AuthService.getMe] Error:', error);
      return null;
    }
  }

  /**
   * Save first and last name via PATCH /auth/me (session JWT required).
   */
  static async updateProfileName(firstName: string, lastName: string): Promise<UserProfile> {
    const session = await this.getSession();
    if (!session) throw new Error('Not authenticated');

    const response = await fetch(`${AUTH_BASE_URL}/me`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${session.jwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ firstName, lastName }),
    });

    await this.handleApiResponse(response);
    const data = await response.json();
    return data as UserProfile;
  }

  // ─── Login instance / nudge ───────────────────────────────────────────────

  /**
   * Set a new login instance ID in SecureStore.
   * Called only on successful magic-link verification (not backdoor).
   */
  static async setNewLoginInstance(): Promise<void> {
    // Generate a unique ID using timestamp + random suffix
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    await SecureStore.setItemAsync(LOGIN_INSTANCE_KEY, id);
  }

  static async getLoginInstanceId(): Promise<string | null> {
    return SecureStore.getItemAsync(LOGIN_INSTANCE_KEY);
  }

  /**
   * Returns true if the phone-nudge has NOT been dismissed for the current login instance.
   */
  static async shouldShowPhoneNudge(): Promise<boolean> {
    const currentInstance = await this.getLoginInstanceId();
    if (!currentInstance) return false;
    const dismissedFor = await SecureStore.getItemAsync(NUDGE_DISMISSED_KEY);
    return dismissedFor !== currentInstance;
  }

  /**
   * Mark the phone nudge as dismissed for the current login instance.
   * Stores the instance ID into NUDGE_DISMISSED_KEY so we can compare on next check.
   */
  static async dismissPhoneNudge(): Promise<void> {
    const currentInstance = await this.getLoginInstanceId();
    if (currentInstance) {
      await SecureStore.setItemAsync(NUDGE_DISMISSED_KEY, currentInstance);
    }
  }

  /**
   * Clear login instance and nudge keys on logout.
   */
  static async clearLoginInstance(): Promise<void> {
    await SecureStore.deleteItemAsync(LOGIN_INSTANCE_KEY);
    await SecureStore.deleteItemAsync(NUDGE_DISMISSED_KEY);
  }

  // ─── Phone verification ───────────────────────────────────────────────────

  /**
   * Send SMS verification code to the given phone number.
   * Requires active session JWT.
   */
  static async validatePhone(phoneNumber: string): Promise<void> {
    const session = await this.getSession();
    if (!session) throw new Error('Not authenticated');

    const response = await fetch(`${PHONE_BASE_URL}/validate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.jwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ phoneNumber }),
    });

    const data = await response.json();
    if (!response.ok) {
      const err = new Error(
        data.message || data.error || 'Failed to send verification code'
      ) as Error & { code?: string; nextAllowedAt?: number; cooldownSecondsRemaining?: number };
      if (data.error === 'phone_change_cooldown') err.code = 'phone_change_cooldown';
      if (data.nextAllowedAt != null) {
        const n =
          typeof data.nextAllowedAt === 'number'
            ? data.nextAllowedAt
            : parseInt(String(data.nextAllowedAt), 10);
        if (!Number.isNaN(n)) err.nextAllowedAt = n;
      }
      if (typeof data.cooldownSecondsRemaining === 'number') {
        err.cooldownSecondsRemaining = data.cooldownSecondsRemaining;
      }
      throw err;
    }
  }

  /**
   * Verify the SMS code entered by the user.
   * Requires active session JWT.
   */
  static async verifyPhone(phoneNumber: string, verificationCode: string): Promise<void> {
    const session = await this.getSession();
    if (!session) throw new Error('Not authenticated');

    const response = await fetch(`${PHONE_BASE_URL}/verify`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.jwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ phoneNumber, verificationCode }),
    });

    const data = await response.json();
    if (!response.ok) {
      const err = new Error(
        data.message || data.error || 'Failed to verify code'
      ) as Error & { code?: string; nextAllowedAt?: number; cooldownSecondsRemaining?: number };
      if (data.error === 'phone_change_cooldown') err.code = 'phone_change_cooldown';
      if (data.nextAllowedAt != null) {
        const n =
          typeof data.nextAllowedAt === 'number'
            ? data.nextAllowedAt
            : parseInt(String(data.nextAllowedAt), 10);
        if (!Number.isNaN(n)) err.nextAllowedAt = n;
      }
      if (typeof data.cooldownSecondsRemaining === 'number') {
        err.cooldownSecondsRemaining = data.cooldownSecondsRemaining;
      }
      throw err;
    }
  }

  /**
   * Handle API response and check for auth/expiration errors.
   *
   * - 401: session JWT is invalid/expired → clears session, throws with isSessionExpired=true
   *        Callers should silently navigate to Login (no alert).
   * - 403 Account expired/deactivated → clears session, throws with isExpirationError=true
   *        Callers should show an explanatory alert then navigate to Login.
   */
  static async handleApiResponse(response: Response): Promise<Response> {
    if (!response.ok) {
      // Clone response to read body without consuming it
      const clonedResponse = response.clone();
      const data = await clonedResponse.json().catch(() => ({}));

      // 401 — invalid or expired session token
      if (response.status === 401) {
        await this.clearSession();
        const error = new Error('Your session has expired. Please sign in again.') as any;
        error.isSessionExpired = true;
        throw error;
      }
      
      // 403 — account expired or deactivated
      if (response.status === 403 && (data.error === 'Account expired' || data.error === 'Account deactivated')) {
        await this.clearSession();
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
