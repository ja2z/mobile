import { Config } from '../constants/Config';

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
 * Service for fetching and managing Sigma embed URLs
 */
export class EmbedUrlService {
  /**
   * Fetches a new embed URL from the API
   * @returns Promise with the embed URL response
   * @throws Error if the API call fails
   */
  static async fetchEmbedUrl(): Promise<EmbedUrlResponse> {
    try {
      const response = await fetch(Config.API.EMBED_URL_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        throw new Error(`API returned status ${response.status}`);
      }

      const data: EmbedUrlResponse = await response.json();

      if (!data.success || !data.url) {
        throw new Error('Invalid response from embed URL API');
      }

      return data;
    } catch (error) {
      console.error('Failed to fetch embed URL:', error);
      throw new Error('Unable to fetch dashboard URL. Please try again later.');
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

