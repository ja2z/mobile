/**
 * Applets Service Module
 * Provides Postgres-based applets operations
 * Replaces DynamoDB operations for My Buys applets management
 */

import { query } from './postgres-client';

export interface Applet {
  userId: string;
  appletId: string;
  name: string;
  embedUrl: string;
  secretName?: string;
  createdAt: number;
  updatedAt: number;
}

interface AppletRow {
  user_id: string;
  applet_id: string;
  name: string;
  embed_url: string;
  secret_name: string | null;
  created_at: number;
  updated_at: number;
}

/**
 * Convert Postgres row to Applet
 */
function rowToApplet(row: AppletRow): Applet {
  return {
    userId: row.user_id,
    appletId: row.applet_id,
    name: row.name,
    embedUrl: row.embed_url,
    secretName: row.secret_name || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Get applet by userId and appletId
 * @param userId - User ID
 * @param appletId - Applet ID
 * @returns Applet or null if not found
 */
export async function getApplet(userId: string, appletId: string): Promise<Applet | null> {
  try {
    const result = await query<AppletRow>(
      'SELECT * FROM applets WHERE user_id = $1 AND applet_id = $2',
      [userId, appletId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return rowToApplet(result.rows[0]);
  } catch (error) {
    console.error('Error getting applet:', error);
    return null;
  }
}

/**
 * List applets for a user (newest first)
 * @param userId - User ID
 * @returns Array of applets
 */
export async function listApplets(userId: string): Promise<Applet[]> {
  try {
    const result = await query<AppletRow>(
      'SELECT * FROM applets WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );

    return result.rows.map(rowToApplet);
  } catch (error) {
    console.error('Error listing applets:', error);
    return [];
  }
}

/**
 * Count applets for a user
 * @param userId - User ID
 * @returns Number of applets
 */
export async function countAppletsByUser(userId: string): Promise<number> {
  try {
    const result = await query<{ count: string }>(
      'SELECT COUNT(*) as count FROM applets WHERE user_id = $1',
      [userId]
    );

    return parseInt(result.rows[0].count, 10);
  } catch (error) {
    console.error('Error counting applets:', error);
    return 0;
  }
}

/**
 * Create a new applet
 * @param applet - Applet data to create
 * @returns Created applet
 */
export async function createApplet(applet: {
  userId: string;
  appletId: string;
  name: string;
  embedUrl: string;
  secretName?: string;
}): Promise<Applet> {
  const now = Math.floor(Date.now() / 1000);

  await query(
    `INSERT INTO applets (
      user_id, applet_id, name, embed_url, secret_name, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (user_id, applet_id) DO UPDATE SET
      name = EXCLUDED.name,
      embed_url = EXCLUDED.embed_url,
      secret_name = EXCLUDED.secret_name,
      updated_at = EXCLUDED.updated_at`,
    [
      applet.userId,
      applet.appletId,
      applet.name,
      applet.embedUrl,
      applet.secretName || null,
      now,
      now,
    ]
  );

  const created = await getApplet(applet.userId, applet.appletId);
  if (!created) {
    throw new Error('Failed to retrieve created applet');
  }
  return created;
}

/**
 * Update an applet
 * @param userId - User ID
 * @param appletId - Applet ID
 * @param updates - Fields to update
 */
export async function updateApplet(
  userId: string,
  appletId: string,
  updates: {
    name?: string;
    embedUrl?: string;
    secretName?: string;
  }
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const setParts: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (updates.name !== undefined) {
    setParts.push(`name = $${paramIndex++}`);
    values.push(updates.name);
  }
  if (updates.embedUrl !== undefined) {
    setParts.push(`embed_url = $${paramIndex++}`);
    values.push(updates.embedUrl);
  }
  if (updates.secretName !== undefined) {
    setParts.push(`secret_name = $${paramIndex++}`);
    values.push(updates.secretName);
  }

  if (setParts.length === 0) {
    return; // Nothing to update
  }

  setParts.push(`updated_at = $${paramIndex++}`);
  values.push(now);
  values.push(userId); // For WHERE clause
  values.push(appletId); // For WHERE clause

  await query(
    `UPDATE applets SET ${setParts.join(', ')} WHERE user_id = $${paramIndex} AND applet_id = $${paramIndex + 1}`,
    values
  );
}

/**
 * Delete an applet
 * @param userId - User ID
 * @param appletId - Applet ID
 */
export async function deleteApplet(userId: string, appletId: string): Promise<void> {
  await query(
    'DELETE FROM applets WHERE user_id = $1 AND applet_id = $2',
    [userId, appletId]
  );
}


