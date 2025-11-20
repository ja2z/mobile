import { Config } from '../constants/Config';
import { AuthService } from './AuthService';

const ADMIN_BASE_URL = Config.API.ADMIN_BASE_URL;

export interface User {
  userId: string;
  email: string;
  role: 'basic' | 'admin';
  createdAt?: number;
  lastActiveAt?: number;
  registrationMethod?: string;
  isDeactivated?: boolean;
  expirationDate?: number;
}

export interface WhitelistUser {
  email: string;
  role: 'basic' | 'admin';
  expirationDate?: number;
  registeredAt?: number;
  hasRegistered: boolean;
  approvedAt?: number;
}

export interface ActivityLog {
  activityId: string;
  userId: string;
  email: string;
  eventType: string;
  timestamp: number;
  deviceId?: string;
  ipAddress?: string;
  metadata?: Record<string, any>;
}

export interface ListUsersParams {
  page?: number;
  limit?: number;
  emailFilter?: string;
  sortBy?: 'email' | 'createdAt' | 'lastActiveAt';
  sortDirection?: 'asc' | 'desc';
  showDeactivated?: boolean;
}

export interface ListUsersResponse {
  users: User[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ListActivityLogsParams {
  page?: number;
  limit?: number;
  emailFilter?: string;
  eventTypeFilter?: string;
}

export interface ListActivityLogsResponse {
  activities: ActivityLog[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Admin Service
 * Handles all admin API calls
 */
export class AdminService {
  /**
   * Get authorization headers with JWT
   */
  private static async getAuthHeaders(): Promise<HeadersInit> {
    const session = await AuthService.getSession();
    if (!session) {
      throw new Error('Not authenticated');
    }

    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.jwt}`,
    };
  }

  /**
   * Make API call with error handling
   */
  private static async apiCall<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const fullUrl = `${ADMIN_BASE_URL}${endpoint}`;
    console.log(`[AdminService] Making API call:`, {
      method: options.method || 'GET',
      url: fullUrl,
      endpoint: endpoint,
      hasBody: !!options.body
    });

    const headers = await this.getAuthHeaders();
    console.log(`[AdminService] Request headers:`, {
      hasAuth: !!headers.Authorization,
      authLength: headers.Authorization?.length || 0,
      contentType: headers['Content-Type']
    });
    
    const requestStartTime = Date.now();
    let response: Response;
    
    try {
      response = await fetch(fullUrl, {
        ...options,
        headers: {
          ...headers,
          ...(options.headers || {}),
        },
      });

      const requestDuration = Date.now() - requestStartTime;
      console.log(`[AdminService] Response received:`, {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        duration: `${requestDuration}ms`,
        headers: Object.fromEntries(response.headers.entries())
      });
    } catch (fetchError) {
      console.error(`[AdminService] Fetch error:`, {
        error: fetchError instanceof Error ? fetchError.message : String(fetchError),
        stack: fetchError instanceof Error ? fetchError.stack : undefined,
        url: fullUrl
      });
      throw fetchError;
    }

    // Handle expiration errors (this will throw if expired)
    try {
      await AuthService.handleApiResponse(response);
    } catch (error: any) {
      // Re-throw expiration errors
      if (error.isExpirationError) {
        throw error;
      }
    }

    // Try to parse JSON, but handle errors gracefully
    let data: any;
    try {
      const responseText = await response.text();
      console.log(`[AdminService] Response body (first 500 chars):`, responseText.substring(0, 500));
      
      if (responseText) {
        data = JSON.parse(responseText);
      } else {
        data = {};
      }
    } catch (parseError) {
      console.error(`[AdminService] JSON parse error:`, {
        error: parseError instanceof Error ? parseError.message : String(parseError),
        status: response.status,
        statusText: response.statusText
      });
      // If we can't parse JSON, create an error object
      data = {
        error: 'Invalid JSON response',
        status: response.status,
        statusText: response.statusText
      };
    }

    if (!response.ok) {
      console.error(`[AdminService] API call failed:`, {
        endpoint: endpoint,
        status: response.status,
        statusText: response.statusText,
        errorData: data
      });
      throw new Error(data.message || data.error || `API error: ${response.status}`);
    }

    console.log(`[AdminService] API call succeeded:`, {
      endpoint: endpoint,
      dataKeys: data ? Object.keys(data) : 'no data'
    });

    return data;
  }

  /**
   * List users with pagination, filtering, and sorting
   */
  static async listUsers(params: ListUsersParams = {}): Promise<ListUsersResponse> {
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.emailFilter) queryParams.append('emailFilter', params.emailFilter);
    if (params.sortBy) queryParams.append('sortBy', params.sortBy);
    if (params.sortDirection) queryParams.append('sortDirection', params.sortDirection);
    if (params.showDeactivated !== undefined) {
      queryParams.append('showDeactivated', params.showDeactivated.toString());
    }

    const queryString = queryParams.toString();
    return this.apiCall<ListUsersResponse>(`/users${queryString ? `?${queryString}` : ''}`);
  }

  /**
   * Get user details
   */
  static async getUser(userId: string): Promise<User> {
    return this.apiCall<User>(`/users/${userId}`);
  }

  /**
   * Update user (role, expiration, reactivate)
   */
  static async updateUser(
    userId: string,
    updates: {
      role?: 'basic' | 'admin';
      expirationDate?: number | null;
      reactivate?: boolean;
    }
  ): Promise<{ success: boolean; message: string }> {
    return this.apiCall(`/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  /**
   * Deactivate user
   */
  static async deactivateUser(userId: string): Promise<{ success: boolean; message: string }> {
    return this.apiCall(`/users/${userId}`, {
      method: 'DELETE',
    });
  }

  /**
   * List whitelist users
   */
  static async listWhitelistUsers(): Promise<{ whitelistUsers: WhitelistUser[] }> {
    return this.apiCall<{ whitelistUsers: WhitelistUser[] }>('/whitelist');
  }

  /**
   * Add whitelist user
   */
  static async addWhitelistUser(
    email: string,
    role: 'basic' | 'admin' = 'basic',
    expirationDate?: number,
    noExpiration: boolean = false
  ): Promise<{ success: boolean; message: string }> {
    return this.apiCall('/whitelist', {
      method: 'POST',
      body: JSON.stringify({
        email,
        role,
        expirationDate,
        noExpiration,
      }),
    });
  }

  /**
   * Delete whitelist user
   */
  static async deleteWhitelistUser(
    email: string
  ): Promise<{ success: boolean; message: string; userWasDeactivated?: boolean }> {
    return this.apiCall(`/whitelist/${encodeURIComponent(email)}`, {
      method: 'DELETE',
    });
  }

  /**
   * Get activity logs with pagination and filtering
   */
  static async getActivityLogs(params: ListActivityLogsParams = {}): Promise<ListActivityLogsResponse> {
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.emailFilter) queryParams.append('emailFilter', params.emailFilter);
    if (params.eventTypeFilter) queryParams.append('eventTypeFilter', params.eventTypeFilter);

    const queryString = queryParams.toString();
    return this.apiCall<ListActivityLogsResponse>(`/activity${queryString ? `?${queryString}` : ''}`);
  }

  /**
   * Get unique activity types from DynamoDB
   */
  static async getActivityTypes(): Promise<{ activityTypes: string[] }> {
    return this.apiCall<{ activityTypes: string[] }>('/activity/types');
  }

  /**
   * Health check endpoint - tests if Lambda is being invoked
   */
  static async healthCheck(): Promise<{ status: string; message: string; timestamp: number }> {
    return this.apiCall<{ status: string; message: string; timestamp: number }>('/health');
  }
}

