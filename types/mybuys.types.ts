/**
 * Type definitions for My Buys feature
 */

export interface Applet {
  appletId: string;
  name: string;
  embedUrl: string;
  secretName?: string; // Reference to secret in secrets table
  createdAt: number;
  updatedAt: number;
}

export interface CreateAppletData {
  name: string;
  embedUrl: string;
  embedClientId: string;
  embedSecretKey: string;
}

export interface UpdateAppletData {
  name: string;
  embedUrl: string;
  embedClientId: string;
  embedSecretKey: string;
}

export interface TestResult {
  success: boolean;
  statusCode: number;
  message: string;
  url?: string;
}

export interface RegeneratedUrlResponse {
  success: boolean;
  url: string;
  jwt: string;
  expiresAt: number;
}

