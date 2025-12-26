/**
 * Approved Emails Service Module
 * Provides Postgres-based approved emails (whitelist) operations
 * Replaces DynamoDB operations for email whitelist management
 */

import { query } from './postgres-client';

export interface ApprovedEmail {
  email: string;
  role: string;
  expirationDate?: number;
  registeredAt?: number;
  approvedBy?: string;
  approvedAt?: number;
  metadata?: Record<string, any>;
}

interface ApprovedEmailRow {
  email: string;
  role: string;
  expiration_date: number | null;
  registered_at: number | null;
  approved_by: string | null;
  approved_at: number | null;
  metadata: any; // JSONB
}

/**
 * Convert Postgres row to ApprovedEmail
 */
function rowToApprovedEmail(row: ApprovedEmailRow): ApprovedEmail {
  let metadata: Record<string, any> | undefined;
  if (row.metadata) {
    if (typeof row.metadata === 'string') {
      try {
        metadata = JSON.parse(row.metadata);
      } catch {
        metadata = undefined;
      }
    } else {
      metadata = row.metadata;
    }
  }

  return {
    email: row.email,
    role: row.role,
    expirationDate: row.expiration_date || undefined,
    registeredAt: row.registered_at || undefined,
    approvedBy: row.approved_by || undefined,
    approvedAt: row.approved_at || undefined,
    metadata,
  };
}

/**
 * Check if email is approved (not expired)
 * @param email - Email address to check
 * @returns true if approved and not expired, false otherwise
 */
export async function isEmailApproved(email: string): Promise<boolean> {
  try {
    const emailLower = email.toLowerCase();
    const result = await query<ApprovedEmailRow>(
      'SELECT * FROM approved_emails WHERE email = $1',
      [emailLower]
    );

    if (result.rows.length === 0) {
      return false;
    }

    const approvedEmail = rowToApprovedEmail(result.rows[0]);

    // Check if expiration date exists and has passed
    if (approvedEmail.expirationDate) {
      const now = Math.floor(Date.now() / 1000);
      if (now >= approvedEmail.expirationDate) {
        return false; // Expired
      }
    }

    return true; // Approved and not expired
  } catch (error) {
    console.error('Error checking email approval:', error);
    return false;
  }
}

/**
 * Get approved email record
 * @param email - Email address to lookup
 * @returns Approved email record or null if not found
 */
export async function getApprovedEmail(email: string): Promise<ApprovedEmail | null> {
  try {
    const emailLower = email.toLowerCase();
    const result = await query<ApprovedEmailRow>(
      'SELECT * FROM approved_emails WHERE email = $1',
      [emailLower]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return rowToApprovedEmail(result.rows[0]);
  } catch (error) {
    console.error('Error getting approved email:', error);
    return null;
  }
}

/**
 * Create or update approved email
 * @param email - Email address
 * @param data - Approved email data
 */
export async function createOrUpdateApprovedEmail(
  email: string,
  data: {
    role?: string;
    expirationDate?: number | null;
    approvedBy?: string;
    approvedAt?: number;
    metadata?: Record<string, any>;
  }
): Promise<void> {
  const emailLower = email.toLowerCase();
  const now = Math.floor(Date.now() / 1000);
  const metadataJson = data.metadata ? JSON.stringify(data.metadata) : null;

  await query(
    `INSERT INTO approved_emails (
      email, role, expiration_date, approved_by, approved_at, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    ON CONFLICT (email) DO UPDATE SET
      role = EXCLUDED.role,
      expiration_date = EXCLUDED.expiration_date,
      approved_by = EXCLUDED.approved_by,
      approved_at = EXCLUDED.approved_at,
      metadata = EXCLUDED.metadata`,
    [
      emailLower,
      data.role || 'basic',
      data.expirationDate || null,
      data.approvedBy || null,
      data.approvedAt || now,
      metadataJson,
    ]
  );
}

/**
 * Update approved email
 * @param email - Email address to update
 * @param updates - Fields to update
 */
export async function updateApprovedEmail(
  email: string,
  updates: {
    role?: string;
    expirationDate?: number | null;
    registeredAt?: number;
    metadata?: Record<string, any>;
  }
): Promise<void> {
  const emailLower = email.toLowerCase();
  const setParts: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (updates.role !== undefined) {
    setParts.push(`role = $${paramIndex++}`);
    values.push(updates.role);
  }
  if (updates.expirationDate !== undefined) {
    setParts.push(`expiration_date = $${paramIndex++}`);
    values.push(updates.expirationDate);
  }
  if (updates.registeredAt !== undefined) {
    setParts.push(`registered_at = $${paramIndex++}`);
    values.push(updates.registeredAt);
  }
  if (updates.metadata !== undefined) {
    setParts.push(`metadata = $${paramIndex++}::jsonb`);
    values.push(JSON.stringify(updates.metadata));
  }

  if (setParts.length === 0) {
    return; // Nothing to update
  }

  values.push(emailLower); // For WHERE clause

  await query(
    `UPDATE approved_emails SET ${setParts.join(', ')} WHERE email = $${paramIndex}`,
    values
  );
}

/**
 * Set registered_at timestamp (only if not already set)
 * @param email - Email address
 * @param registeredAt - Timestamp to set
 */
export async function setRegisteredAtIfNotExists(
  email: string,
  registeredAt: number
): Promise<void> {
  const emailLower = email.toLowerCase();
  
  await query(
    `UPDATE approved_emails 
     SET registered_at = COALESCE(registered_at, $1)
     WHERE email = $2 AND registered_at IS NULL`,
    [registeredAt, emailLower]
  );
}

/**
 * Delete approved email
 * @param email - Email address to delete
 */
export async function deleteApprovedEmail(email: string): Promise<void> {
  const emailLower = email.toLowerCase();
  await query('DELETE FROM approved_emails WHERE email = $1', [emailLower]);
}

/**
 * List all approved emails
 * @returns Array of approved email records
 */
export async function listApprovedEmails(): Promise<ApprovedEmail[]> {
  try {
    const result = await query<ApprovedEmailRow>(
      'SELECT * FROM approved_emails ORDER BY approved_at DESC NULLS LAST'
    );

    return result.rows.map(rowToApprovedEmail);
  } catch (error) {
    console.error('Error listing approved emails:', error);
    return [];
  }
}


