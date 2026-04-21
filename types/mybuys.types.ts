/**
 * Type definitions for My Apps feature
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
  /** Preset id or `custom` for tile + header/footer accent (derived from `color` on read). */
  themeId?: string;
  /** When themeId is `custom`, 6-digit hex e.g. #A1B2C3 */
  themeCustomHex?: string;
  /** Persisted accent hex in Postgres `applets.color` (#RRGGBB uppercase). */
  color?: string;
  /** User-selected Ionicons glyph name for this applet's tile. */
  iconName?: string | null;
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
  themeId?: string;
  themeCustomHex?: string;
  /** Optional direct hex override; MyBuysService otherwise derives it from themeId/themeCustomHex. */
  color?: string;
  /** Ionicons glyph name for the applet tile. */
  iconName?: string | null;
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
  themeId?: string;
  themeCustomHex?: string;
  /** Optional direct hex override; MyBuysService otherwise derives it from themeId/themeCustomHex. */
  color?: string;
  /** Ionicons glyph name for the applet tile. */
  iconName?: string | null;
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
