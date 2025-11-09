import { Config } from '../constants/Config';
import { AuthService } from './AuthService';

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
    try {
      const session = await AuthService.getSession();
      if (!session) {
        console.warn('Cannot log activity: user not authenticated');
        return;
      }

      // Get device ID
      const deviceId = await this.getDeviceId();

      // Call admin Lambda to log activity
      const response = await fetch(`${ADMIN_BASE_URL}/activity/log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.jwt}`,
        },
        body: JSON.stringify({
          eventType,
          metadata,
          deviceId,
        }),
      });

      // Handle expiration errors
      try {
        await AuthService.handleApiResponse(response);
      } catch (error: any) {
        // If expiration error, it's already handled by handleApiResponse
        // Just log and return
        if (error.isExpirationError) {
          console.warn('Account expired while logging activity');
          return;
        }
      }

      if (!response.ok) {
        console.error('Failed to log activity:', response.status);
      }
    } catch (error) {
      console.error('Error logging activity:', error);
      // Don't throw - activity logging should not break the app
    }
  }

  /**
   * Get or create device ID
   */
  private static async getDeviceId(): Promise<string> {
    try {
      const { getItemAsync, setItemAsync } = await import('expo-secure-store');
      let deviceId = await getItemAsync('device_id');
      
      if (!deviceId) {
        const Device = await import('expo-device');
        const platform = Device.osName || 'unknown';
        const deviceName = Device.deviceName || 'unknown';
        const deviceIdBase = `${platform}_${deviceName}_${Date.now()}`;
        deviceId = deviceIdBase.replace(/\s+/g, '_').toLowerCase();
        await setItemAsync('device_id', deviceId);
      }
      
      return deviceId;
    } catch (error) {
      console.warn('Could not get device ID:', error);
      return `dev_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    }
  }
}

