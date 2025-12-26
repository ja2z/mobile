/**
 * User Service Module
 * Provides Postgres-based user operations
 * Replaces DynamoDB operations for user management
 */

import { query, getClient } from './postgres-client';

export interface UserProfile {
  userId: string;
  email: string;
  role: string;
  expirationDate?: number;
  isDeactivated?: boolean;
  deactivatedAt?: number;
  lastActiveAt?: number;
  registrationMethod?: string;
  phoneNumber?: string;
  createdAt?: number;
  updatedAt?: number;
}

interface UserRow {
  user_id: string;
  email: string;
  role: string;
  expiration_date: number | null;
  is_deactivated: boolean;
  deactivated_at: number | null;
  last_active_at: number | null;
  registration_method: string | null;
  phone_number: string | null;
  created_at: number;
  updated_at: number;
}

/**
 * Convert Postgres row to UserProfile
 */
function rowToUserProfile(row: UserRow): UserProfile {
  return {
    userId: row.user_id,
    email: row.email,
    role: row.role,
    expirationDate: row.expiration_date || undefined,
    isDeactivated: row.is_deactivated,
    deactivatedAt: row.deactivated_at || undefined,
    lastActiveAt: row.last_active_at || undefined,
    registrationMethod: row.registration_method || undefined,
    phoneNumber: row.phone_number || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Get user profile by userId
 * @param userId - User ID to fetch
 * @returns User profile or null if not found
 */
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  try {
    const result = await query<UserRow>(
      'SELECT * FROM users WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return rowToUserProfile(result.rows[0]);
  } catch (error) {
    console.error('Error getting user profile:', error);
    return null;
  }
}

/**
 * Get user profile by email
 * @param email - Email address to lookup
 * @returns User profile or null if not found
 */
export async function getUserProfileByEmail(email: string): Promise<UserProfile | null> {
  try {
    const emailLower = email.toLowerCase();
    const result = await query<UserRow>(
      'SELECT * FROM users WHERE email = $1',
      [emailLower]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return rowToUserProfile(result.rows[0]);
  } catch (error) {
    console.error('Error getting user profile by email:', error);
    return null;
  }
}

/**
 * Create a new user
 * @param user - User data to create
 * @returns Created user profile
 */
export async function createUser(user: {
  userId: string;
  email: string;
  role: string;
  expirationDate?: number;
  registrationMethod?: string;
  phoneNumber?: string;
}): Promise<UserProfile> {
  const now = Math.floor(Date.now() / 1000);
  
  await query(
    `INSERT INTO users (
      user_id, email, role, expiration_date, registration_method, 
      phone_number, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (user_id) DO UPDATE SET
      email = EXCLUDED.email,
      role = EXCLUDED.role,
      expiration_date = EXCLUDED.expiration_date,
      registration_method = EXCLUDED.registration_method,
      phone_number = EXCLUDED.phone_number,
      updated_at = EXCLUDED.updated_at`,
    [
      user.userId,
      user.email.toLowerCase(),
      user.role,
      user.expirationDate || null,
      user.registrationMethod || null,
      user.phoneNumber || null,
      now,
      now,
    ]
  );

  const created = await getUserProfile(user.userId);
  if (!created) {
    throw new Error('Failed to retrieve created user');
  }
  return created;
}

/**
 * Update user fields
 * @param userId - User ID to update
 * @param updates - Fields to update
 */
export async function updateUser(
  userId: string,
  updates: {
    role?: string;
    expirationDate?: number | null;
    isDeactivated?: boolean;
    deactivatedAt?: number | null;
    lastActiveAt?: number | null;
    registrationMethod?: string;
    phoneNumber?: string;
  }
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const setParts: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (updates.role !== undefined) {
    setParts.push(`role = $${paramIndex++}`);
    values.push(updates.role);
  }
  if (updates.expirationDate !== undefined) {
    console.log('[updateUser] Adding expirationDate to update:', {
      expirationDate: updates.expirationDate,
      type: typeof updates.expirationDate,
      isNull: updates.expirationDate === null
    });
    setParts.push(`expiration_date = $${paramIndex++}`);
    values.push(updates.expirationDate);
  }
  if (updates.isDeactivated !== undefined) {
    setParts.push(`is_deactivated = $${paramIndex++}`);
    values.push(updates.isDeactivated);
  }
  if (updates.deactivatedAt !== undefined) {
    setParts.push(`deactivated_at = $${paramIndex++}`);
    values.push(updates.deactivatedAt);
  }
  if (updates.lastActiveAt !== undefined) {
    setParts.push(`last_active_at = $${paramIndex++}`);
    values.push(updates.lastActiveAt);
  }
  if (updates.registrationMethod !== undefined) {
    setParts.push(`registration_method = $${paramIndex++}`);
    values.push(updates.registrationMethod);
  }
  if (updates.phoneNumber !== undefined) {
    setParts.push(`phone_number = $${paramIndex++}`);
    values.push(updates.phoneNumber);
  }

  if (setParts.length === 0) {
    return; // Nothing to update
  }

  setParts.push(`updated_at = $${paramIndex++}`);
  values.push(now);
  values.push(userId); // For WHERE clause

  const updateQuery = `UPDATE users SET ${setParts.join(', ')} WHERE user_id = $${paramIndex}`;
  console.log('[updateUser] Executing SQL update:', {
    query: updateQuery,
    values: values.map((v, i) => ({ param: i + 1, value: v, type: typeof v })),
    userId
  });

  await query(updateQuery, values);
  
  console.log('[updateUser] SQL update completed successfully');
}

/**
 * Update user's last active time
 * @param userId - User ID to update
 */
export async function updateLastActiveTime(userId: string): Promise<void> {
  try {
    const now = Math.floor(Date.now() / 1000);
    await query(
      'UPDATE users SET last_active_at = $1, updated_at = $2 WHERE user_id = $3',
      [now, now, userId]
    );
  } catch (error) {
    console.error('Error updating last active time:', error);
    // Don't throw - last active time update should not break the main flow
  }
}

/**
 * List all users (for admin operations)
 * @param limit - Maximum number of users to return
 * @param offset - Offset for pagination
 * @returns Array of user profiles
 */
export async function listUsers(limit: number = 100, offset: number = 0): Promise<UserProfile[]> {
  try {
    const result = await query<UserRow>(
      'SELECT * FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );

    return result.rows.map(rowToUserProfile);
  } catch (error) {
    console.error('Error listing users:', error);
    return [];
  }
}

/**
 * Delete a user
 * @param userId - User ID to delete
 */
export async function deleteUser(userId: string): Promise<void> {
  await query('DELETE FROM users WHERE user_id = $1', [userId]);
}


