import { Config } from '../constants/Config';
import { AuthService } from './AuthService';
import type { Applet, CreateAppletData, UpdateAppletData, TestResult, RegeneratedUrlResponse } from '../types/mybuys.types';

const MY_BUYS_BASE_URL = Config.API.MY_BUYS_BASE_URL;

/**
 * Service for managing My Buys applets
 */
export class MyBuysService {
  /**
   * Create a new applet
   */
  static async createApplet(data: CreateAppletData): Promise<Applet> {
    try {
      const session = await AuthService.getSession();
      if (!session) {
        throw new Error('Not authenticated. Please sign in.');
      }

      const response = await fetch(`${MY_BUYS_BASE_URL}/applets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.jwt}`,
        },
        body: JSON.stringify(data),
      });

      await AuthService.handleApiResponse(response);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || `API returned status ${response.status}`);
      }

      const result = await response.json();
      if (!result.success || !result.applet) {
        throw new Error('Invalid response from API');
      }

      return result.applet;
    } catch (error) {
      const originalError = error instanceof Error ? error : new Error(String(error));
      console.error('Failed to create applet:', originalError);
      throw originalError;
    }
  }

  /**
   * List all applets for the current user
   */
  static async listApplets(): Promise<Applet[]> {
    try {
      const session = await AuthService.getSession();
      if (!session) {
        throw new Error('Not authenticated. Please sign in.');
      }

      // Log request details for debugging
      console.log('[MyBuysService] Making request to:', `${MY_BUYS_BASE_URL}/applets`);
      console.log('[MyBuysService] Authorization header present:', !!session.jwt);
      console.log('[MyBuysService] Authorization header length:', session.jwt?.length || 0);
      console.log('[MyBuysService] Authorization header starts with Bearer:', session.jwt?.startsWith('Bearer ') || false);

      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.jwt}`,
      };

      console.log('[MyBuysService] Request headers:', {
        'Content-Type': headers['Content-Type'],
        'Authorization': headers['Authorization'] ? `${headers['Authorization'].substring(0, 20)}...` : 'missing',
      });

      const response = await fetch(`${MY_BUYS_BASE_URL}/applets`, {
        method: 'GET',
        headers,
      });

      console.log('[MyBuysService] Response status:', response.status, response.statusText);

      await AuthService.handleApiResponse(response);

      if (!response.ok) {
        // Try to get error details from response
        let errorData: any = {};
        try {
          const responseText = await response.text();
          console.error('[MyBuysService] Error response body:', responseText);
          try {
            errorData = JSON.parse(responseText);
          } catch {
            // Not JSON, use text as error message
            errorData = { message: responseText || `API returned status ${response.status}` };
          }
        } catch (e) {
          console.error('[MyBuysService] Error reading error response:', e);
        }

        // Check for API Gateway authorization errors
        const errorMessage = errorData.message || errorData.error || `API returned status ${response.status}`;
        if (errorMessage.includes('Invalid key=value pair') || errorMessage.includes('Authorization header')) {
          throw new Error(`API Gateway configuration error: ${errorMessage}. Please check that API Gateway authorization is set to NONE for this endpoint.`);
        }

        // Log full error details for debugging
        console.error('[MyBuysService] Full error response:', {
          status: response.status,
          statusText: response.statusText,
          errorData,
          errorMessage
        });

        throw new Error(errorMessage);
      }

      const result = await response.json();
      if (!result.success || !Array.isArray(result.applets)) {
        throw new Error('Invalid response from API');
      }

      return result.applets;
    } catch (error) {
      const originalError = error instanceof Error ? error : new Error(String(error));
      console.error('Failed to list applets:', originalError);
      throw originalError;
    }
  }

  /**
   * Update an existing applet
   */
  static async updateApplet(appletId: string, data: UpdateAppletData): Promise<Applet> {
    try {
      const session = await AuthService.getSession();
      if (!session) {
        throw new Error('Not authenticated. Please sign in.');
      }

      const response = await fetch(`${MY_BUYS_BASE_URL}/applets/${appletId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.jwt}`,
        },
        body: JSON.stringify(data),
      });

      await AuthService.handleApiResponse(response);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || `API returned status ${response.status}`);
      }

      const result = await response.json();
      if (!result.success || !result.applet) {
        throw new Error('Invalid response from API');
      }

      return result.applet;
    } catch (error) {
      const originalError = error instanceof Error ? error : new Error(String(error));
      console.error('Failed to update applet:', originalError);
      throw originalError;
    }
  }

  /**
   * Delete an applet
   */
  static async deleteApplet(appletId: string): Promise<void> {
    try {
      const session = await AuthService.getSession();
      if (!session) {
        throw new Error('Not authenticated. Please sign in.');
      }

      const response = await fetch(`${MY_BUYS_BASE_URL}/applets/${appletId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.jwt}`,
        },
      });

      await AuthService.handleApiResponse(response);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || `API returned status ${response.status}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error('Failed to delete applet');
      }
    } catch (error) {
      const originalError = error instanceof Error ? error : new Error(String(error));
      console.error('Failed to delete applet:', originalError);
      throw originalError;
    }
  }

  /**
   * Test a configuration without creating an applet
   */
  static async testConfiguration(data: { embedUrl: string; embedClientId: string; embedSecretKey: string }): Promise<TestResult> {
    try {
      const session = await AuthService.getSession();
      if (!session) {
        throw new Error('Not authenticated. Please sign in.');
      }

      const response = await fetch(`${MY_BUYS_BASE_URL}/applets/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.jwt}`,
        },
        body: JSON.stringify(data),
      });

      await AuthService.handleApiResponse(response);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          statusCode: response.status,
          message: errorData.message || errorData.error || `HTTP ${response.status}`,
        };
      }

      const result = await response.json();
      return {
        success: result.success || false,
        statusCode: result.statusCode || response.status,
        message: result.message || 'Test completed',
        url: result.url,
      };
    } catch (error) {
      const originalError = error instanceof Error ? error : new Error(String(error));
      console.error('Failed to test configuration:', originalError);
      return {
        success: false,
        statusCode: 0,
        message: originalError.message || 'Network error',
      };
    }
  }

  /**
   * Test an applet configuration
   */
  static async testApplet(appletId: string, embedSecretKey: string): Promise<TestResult> {
    try {
      const session = await AuthService.getSession();
      if (!session) {
        throw new Error('Not authenticated. Please sign in.');
      }

      const response = await fetch(`${MY_BUYS_BASE_URL}/applets/${appletId}/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.jwt}`,
        },
        body: JSON.stringify({ embedSecretKey }),
      });

      await AuthService.handleApiResponse(response);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          statusCode: response.status,
          message: errorData.message || errorData.error || `HTTP ${response.status}`,
        };
      }

      const result = await response.json();
      return {
        success: result.success || false,
        statusCode: result.statusCode || response.status,
        message: result.message || 'Test completed',
        url: result.url,
      };
    } catch (error) {
      const originalError = error instanceof Error ? error : new Error(String(error));
      console.error('Failed to test applet:', originalError);
      return {
        success: false,
        statusCode: 0,
        message: originalError.message || 'Network error',
      };
    }
  }

  /**
   * Fetch with timeout wrapper
   */
  private static async fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number = 30000): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeoutMs}ms. The server may be slow or unavailable.`);
      }
      throw error;
    }
  }

  /**
   * Get regenerated embed URL for viewing an applet
   */
  static async getRegeneratedUrl(appletId: string): Promise<RegeneratedUrlResponse> {
    const startTime = Date.now();
    console.log('[MyBuysService] Starting getRegeneratedUrl for appletId:', appletId);
    
    try {
      console.log('[MyBuysService] Step 1: Getting session...');
      const session = await AuthService.getSession();
      if (!session) {
        throw new Error('Not authenticated. Please sign in.');
      }
      console.log('[MyBuysService] Step 1 complete: Session obtained');

      const url = `${MY_BUYS_BASE_URL}/applets/${appletId}/regenerate-url`;
      console.log('[MyBuysService] Step 2: Making fetch request to:', url);
      
      const fetchStartTime = Date.now();
      const response = await this.fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.jwt}`,
          },
        },
        30000 // 30 second timeout
      );
      const fetchDuration = Date.now() - fetchStartTime;
      console.log('[MyBuysService] Step 2 complete: Fetch completed in', fetchDuration, 'ms, status:', response.status);

      console.log('[MyBuysService] Step 3: Handling API response...');
      await AuthService.handleApiResponse(response);
      console.log('[MyBuysService] Step 3 complete: API response handled');

      if (!response.ok) {
        console.log('[MyBuysService] Response not OK, parsing error...');
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || `API returned status ${response.status}`);
      }

      console.log('[MyBuysService] Step 4: Parsing response JSON...');
      const result = await response.json();
      console.log('[MyBuysService] Step 4 complete: JSON parsed, success:', result.success, 'hasUrl:', !!result.url);
      
      if (!result.success || !result.url) {
        throw new Error('Invalid response from API');
      }

      const totalDuration = Date.now() - startTime;
      console.log('[MyBuysService] getRegeneratedUrl completed successfully in', totalDuration, 'ms');

      return {
        success: result.success,
        url: result.url,
        jwt: result.jwt || '',
        expiresAt: result.expiresAt || 0,
      };
    } catch (error) {
      const totalDuration = Date.now() - startTime;
      const originalError = error instanceof Error ? error : new Error(String(error));
      console.error('[MyBuysService] Failed to get regenerated URL after', totalDuration, 'ms:', {
        message: originalError.message,
        name: originalError.name,
        stack: originalError.stack,
        appletId,
      });
      throw originalError;
    }
  }

  /**
   * Extract secret name from embed URL (e.g., "papercrane" from sigmacomputing.com/papercrane/workbook/...)
   */
  static extractSecretNameFromUrl(url: string): string | null {
    try {
      const match = url.match(/(?:app\.sigmacomputing\.com|staging\.sigmacomputing\.io)\/([^\/]+)\//);
      if (match && match[1]) {
        return match[1];
      }
      return null;
    } catch (error) {
      console.error('Error extracting secret name from URL:', error);
      return null;
    }
  }

  /**
   * Get secret by name for auto-population
   */
  static async getSecretByName(secretName: string): Promise<{ clientId: string; secretKey: string } | null> {
    try {
      const session = await AuthService.getSession();
      if (!session) {
        throw new Error('Not authenticated. Please sign in.');
      }

      const response = await fetch(`${MY_BUYS_BASE_URL}/secrets/${encodeURIComponent(secretName)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.jwt}`,
        },
      });

      // Handle 404 (secret not found) before AuthService.handleApiResponse, which throws on non-ok responses
      if (response.status === 404) {
        // Secret not found is not an error - just return null
        return null;
      }

      await AuthService.handleApiResponse(response);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || `API returned status ${response.status}`);
      }

      const result = await response.json();
      if (!result.success || !result.secret) {
        return null;
      }

      return {
        clientId: result.secret.clientId,
        secretKey: result.secret.secretKey,
      };
    } catch (error) {
      const originalError = error instanceof Error ? error : new Error(String(error));
      console.error('Failed to get secret by name:', originalError);
      // Return null on error so the user can still manually enter credentials
      return null;
    }
  }
}

