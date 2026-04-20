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
  /** Sigma page id for first paint on tap-to-open (optional). */
  initial_page_id?: string | null;
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

/**
 * Update the global accent color for a built-in applet.
 * Pass color = null to clear (revert to default accent on the client).
 * Returns the updated row, or null if no applet exists with that id.
 */
export async function updateBuiltInAppletColor(
  appletId: string,
  color: string | null
): Promise<BuiltInAppletRow | null> {
  const { rows } = await query<BuiltInAppletRow>(
    'UPDATE built_in_applets SET color = $2, updated_at = EXTRACT(EPOCH FROM NOW())::bigint ' +
      'WHERE applet_id = $1 RETURNING *',
    [appletId, color]
  );
  return rows[0] ?? null;
}

export interface BuiltInAppletUpdate {
  name?: string;
  subtitle?: string | null;
  color?: string | null;
}

/**
 * Partial update for a built-in applet's editable display fields.
 * Only provided fields are written; omit a field to leave it untouched.
 * Returns the updated row, or null if no applet exists with that id.
 */
export async function updateBuiltInApplet(
  appletId: string,
  updates: BuiltInAppletUpdate
): Promise<BuiltInAppletRow | null> {
  const sets: string[] = [];
  const values: unknown[] = [appletId];
  let idx = 2;

  if (updates.name !== undefined) {
    sets.push(`name = $${idx++}`);
    values.push(updates.name);
  }
  if (updates.subtitle !== undefined) {
    sets.push(`subtitle = $${idx++}`);
    values.push(updates.subtitle);
  }
  if (updates.color !== undefined) {
    sets.push(`color = $${idx++}`);
    values.push(updates.color);
  }

  // Nothing to change - just return the current row so callers get a
  // consistent shape.
  if (sets.length === 0) {
    const { rows } = await query<BuiltInAppletRow>(
      'SELECT * FROM built_in_applets WHERE applet_id = $1',
      [appletId]
    );
    return rows[0] ?? null;
  }

  sets.push(`updated_at = EXTRACT(EPOCH FROM NOW())::bigint`);
  const { rows } = await query<BuiltInAppletRow>(
    `UPDATE built_in_applets SET ${sets.join(', ')} WHERE applet_id = $1 RETURNING *`,
    values
  );
  return rows[0] ?? null;
}
