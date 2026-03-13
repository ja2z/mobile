/**
 * Built-in Applets Service
 * Fetches built-in applet metadata from the API for list screens and deep links
 */

import { Config } from '../constants/Config';
import { AuthService } from './AuthService';

export interface BuiltInApplet {
  applet_id: string;
  slug: string;
  list_screen: string;
  target_screen: string;
  app_name: string | null;
  name: string;
  subtitle: string | null;
  workbook_id: string | null;
  embed_path: string;
  icon_name: string | null;
  color: string | null;
  sort_order: number;
  teams: string[] | null;
  user_attributes: Record<string, unknown> | null;
  account_type: string | null;
}

/**
 * List all built-in applets
 * Requires authentication
 */
export async function listBuiltInApplets(): Promise<BuiltInApplet[]> {
  const session = await AuthService.getSession();
  if (!session) {
    throw new Error('Not authenticated');
  }

  const baseUrl = Config.API.ADMIN_BASE_URL.replace('/admin', '');
  const url = `${baseUrl}/applets/built-in`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.jwt}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || errorData.message || `Failed to fetch applets: ${response.status}`);
  }

  const data = await response.json();
  return data.applets || [];
}
