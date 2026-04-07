/**
 * Type definitions for My Buys feature
 */

export interface PageFooterPageConfig {
  pageId: string;
  name: string;
  showInFooter: boolean;
  emoji: string;
}

export interface PageFooterConfig {
  pages: PageFooterPageConfig[];
}

export interface Applet {
  appletId: string;
  name: string;
  embedUrl: string;
  secretName?: string;
  /** Globally unique mybuys:word-word-word value for magic link `app` param */
  deepLinkSlug?: string;
  sigmaApiBaseUrl?: string;
  restApiSameAsEmbed?: boolean;
  pageFooterConfig?: PageFooterConfig;
  createdAt: number;
  updatedAt: number;
}

export interface CreateAppletData {
  name: string;
  embedUrl: string;
  embedClientId: string;
  embedSecretKey: string;
  sigmaApiBaseUrl?: string;
  restApiSameAsEmbed?: boolean;
  pageFooterConfig?: PageFooterConfig;
  restApiClientId?: string;
  restApiSecretKey?: string;
}

export interface UpdateAppletData {
  name: string;
  embedUrl: string;
  embedClientId: string;
  embedSecretKey: string;
  sigmaApiBaseUrl?: string;
  restApiSameAsEmbed?: boolean;
  pageFooterConfig?: PageFooterConfig;
  restApiClientId?: string;
  restApiSecretKey?: string;
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
