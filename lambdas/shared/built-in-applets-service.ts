/**
 * Built-in Applets Service
 * Fetches built-in applet metadata from Postgres (built_in_applets table)
 * Returns JWT override columns (teams, user_attributes, account_type)
 */

import { query } from './postgres-client';

export interface BuiltInAppletRow {
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
  created_at: number;
  updated_at: number;
}

/**
 * Get built-in applet by appletId or appletName
 * appletId takes precedence if both provided
 * Returns null if not found
 */
export async function getBuiltInAppletByIdOrName(
  appletId?: string,
  appletName?: string
): Promise<BuiltInAppletRow | null> {
  if (appletId) {
    const { rows } = await query<BuiltInAppletRow>(
      'SELECT * FROM built_in_applets WHERE applet_id = $1',
      [appletId]
    );
    if (rows[0]) return rows[0];
  }
  if (appletName) {
    const { rows } = await query<BuiltInAppletRow>(
      'SELECT * FROM built_in_applets WHERE LOWER(name) = LOWER($1)',
      [appletName]
    );
    if (rows[0]) return rows[0];
  }
  return null;
}

/**
 * Get built-in applet by app_name (for deep links)
 * Case-insensitive; supports variants like 'ai-newsletter' and 'ainewsletter'
 */
export async function getBuiltInAppletByAppName(appName: string): Promise<BuiltInAppletRow | null> {
  if (!appName) return null;
  const normalized = appName.toLowerCase().replace(/-/g, '');
  const { rows } = await query<BuiltInAppletRow>(
    `SELECT * FROM built_in_applets 
     WHERE app_name IS NOT NULL 
     AND LOWER(REPLACE(app_name, '-', '')) = $1`,
    [normalized]
  );
  return rows[0] ?? null;
}

/**
 * List all built-in applets, optionally filtered by list_screen
 */
export async function listBuiltInApplets(listScreen?: string): Promise<BuiltInAppletRow[]> {
  if (listScreen) {
    const { rows } = await query<BuiltInAppletRow>(
      'SELECT * FROM built_in_applets WHERE list_screen = $1 ORDER BY sort_order, name',
      [listScreen]
    );
    return rows;
  }
  const { rows } = await query<BuiltInAppletRow>(
    'SELECT * FROM built_in_applets ORDER BY sort_order, name'
  );
  return rows;
}
