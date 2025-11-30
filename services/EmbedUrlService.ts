import { Config } from '../constants/Config';
import { AuthService } from './AuthService';

/**
 * Response from the Sigma embed URL API
 */
interface EmbedUrlResponse {
  success: boolean;
  url: string;
  jwt: string;
  expires_at: number;
}

/**
 * Parameters for customizing the embed URL request
 */
interface EmbedUrlParams {
  workbook_id?: string;
  merchant_id?: string;
  user_email?: string;
  embed_path?: string;
  teams?: string[];
  applet_id?: string;
  applet_name?: string;
  page_id?: string;
  variables?: Record<string, string>;
}

/**
 * Service for fetching and managing Sigma embed URLs
 */
export class EmbedUrlService {
  /**
   * Fetches a new embed URL from the API
   * @param params Optional parameters to customize the embed URL
   * @returns Promise with the embed URL response
   * @throws Error if the API call fails
   */
  static async fetchEmbedUrl(params?: EmbedUrlParams): Promise<EmbedUrlResponse> {
    try {
      console.log('📡 Fetching embed URL from:', Config.API.EMBED_URL_ENDPOINT);
      
      // Get authentication token
      const session = await AuthService.getSession();
      if (!session) {
        throw new Error('Not authenticated. Please sign in to view dashboards.');
      }
      
      // Build headers with Authorization
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };
      
      // Add Authorization header with JWT
      headers['Authorization'] = `Bearer ${session.jwt}`;
      
      const response = await fetch(Config.API.EMBED_URL_ENDPOINT, {
        method: 'POST',
        headers,
        body: JSON.stringify(params || {}),
      });

      console.log('📡 API response status:', response.status, response.statusText);

      // Handle expiration errors
      await AuthService.handleApiResponse(response);

      if (!response.ok) {
        // Try to get error details from response body
        let errorBody = '';
        try {
          errorBody = await response.text();
          console.error('📡 API error response body:', errorBody);
          // Try to parse as JSON for better error message
          try {
            const errorJson = JSON.parse(errorBody);
            errorBody = JSON.stringify(errorJson);
          } catch {
            // Not JSON, use as-is
          }
        } catch (e) {
          // Ignore errors reading error body
        }
        throw new Error(`API returned status ${response.status}${errorBody ? `: ${errorBody}` : ''}`);
      }

      const data: EmbedUrlResponse = await response.json();
      console.log('📡 API response data:', { success: data.success, hasUrl: !!data.url });

      if (!data.success || !data.url) {
        throw new Error(`Invalid response from embed URL API: ${JSON.stringify(data)}`);
      }

      return data;
    } catch (error) {
      // Preserve original error details for debugging
      const originalError = error instanceof Error ? error : new Error(String(error));
      console.error('❌ Failed to fetch embed URL:', {
        message: originalError.message,
        name: originalError.name,
        stack: originalError.stack,
      });
      
      // Re-throw with more context but preserve original error
      if (originalError.message.includes('API returned status')) {
        throw originalError; // Already has good error message
      }
      throw new Error(`Unable to fetch dashboard URL: ${originalError.message}`);
    }
  }

  /**
   * Calculates when to refresh the URL based on expiry time
   * @param expiresAt Unix timestamp (seconds) when the URL expires
   * @returns milliseconds until refresh should occur
   */
  static getRefreshTimeout(expiresAt: number): number {
    const now = Math.floor(Date.now() / 1000); // Current time in seconds
    const expiresIn = expiresAt - now;
    const refreshIn = expiresIn - Config.WEBVIEW.REFRESH_BUFFER_SECONDS;
    
    // If already expired or expiring very soon, refresh immediately
    if (refreshIn <= 0) {
      return 0;
    }
    
    // Convert to milliseconds
    return refreshIn * 1000;
  }
}