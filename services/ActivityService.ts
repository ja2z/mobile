import { Config } from '../constants/Config';
import { AuthService } from './AuthService';
import * as SecureStore from 'expo-secure-store';
import * as Device from 'expo-device';

const ADMIN_BASE_URL = Config.API.ADMIN_BASE_URL;

/**
 * Activity Service
 * Handles logging user activity from the mobile app
 */
export class ActivityService {
  /**
   * Log activity from mobile app
   * This calls the admin Lambda to log the activity
   */
  static async logActivity(
    eventType: string,
    metadata: Record<string, any> = {}
  ): Promise<void> {
    console.log('[ActivityService] logActivity called:', { eventType, metadata });
    
    try {
      const session = await AuthService.getSession();
      if (!session) {
        console.warn('[ActivityService] Cannot log activity: user not authenticated');
        return;
      }

      console.log('[ActivityService] Session found:', {
        userId: session.user.userId,
        email: session.user.email,
        role: session.user.role,
        hasJWT: !!session.jwt,
        jwtLength: session.jwt?.length
      });

      // Get device ID
      const deviceId = await this.getDeviceId();
      console.log('[ActivityService] Device ID:', deviceId);

      const requestBody = {
        eventType,
        metadata,
        deviceId,
      };
      
      console.log('[ActivityService] Making request to:', `${ADMIN_BASE_URL}/activity/log`);
      console.log('[ActivityService] Request body:', JSON.stringify(requestBody, null, 2));
      console.log('[ActivityService] Authorization header present:', !!session.jwt);

      // Call admin Lambda to log activity
      const response = await fetch(`${ADMIN_BASE_URL}/activity/log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.jwt}`,
        },
        body: JSON.stringify(requestBody),
      });

      console.log('[ActivityService] Response received:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries())
      });

      // Handle expiration errors
      try {
        await AuthService.handleApiResponse(response);
      } catch (error: any) {
        // If expiration error, it's already handled by handleApiResponse
        // Just log and return
        if (error.isExpirationError) {
          console.warn('[ActivityService] Account expired while logging activity');
          return;
        }
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Could not read error response');
        console.error('[ActivityService] Failed to log activity:', {
          status: response.status,
          statusText: response.statusText,
          errorBody: errorText
        });
      } else {
        const responseData = await response.json().catch(() => null);
        console.log('[ActivityService] Activity logged successfully:', responseData);
      }
    } catch (error) {
      console.error('[ActivityService] Error logging activity:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        errorType: error instanceof Error ? error.constructor.name : typeof error
      });
      // Don't throw - activity logging should not break the app
    }
  }

  /**
   * Get or create device ID
   */
  private static async getDeviceId(): Promise<string> {
    try {
      let deviceId = await SecureStore.getItemAsync('device_id');
      
      if (!deviceId) {
        const platform = Device.osName || 'unknown';
        const deviceName = Device.deviceName || 'unknown';
        const deviceIdBase = `${platform}_${deviceName}_${Date.now()}`;
        deviceId = deviceIdBase.replace(/\s+/g, '_').toLowerCase();
        await SecureStore.setItemAsync('device_id', deviceId);
      }
      
      return deviceId;
    } catch (error) {
      console.warn('Could not get device ID:', error);
      return `dev_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    }
  }
}

