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
    const headers = await this.getAuthHeaders();
    
    const response = await fetch(`${ADMIN_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        ...headers,
        ...(options.headers || {}),
      },
    });

    // Handle expiration errors (this will throw if expired)
    try {
      await AuthService.handleApiResponse(response);
    } catch (error: any) {
      // Re-throw expiration errors
      if (error.isExpirationError) {
        throw error;
      }
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || data.error || `API error: ${response.status}`);
    }

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

    const queryString = queryParams.toString();
    return this.apiCall<ListActivityLogsResponse>(`/activity${queryString ? `?${queryString}` : ''}`);
  }
}

