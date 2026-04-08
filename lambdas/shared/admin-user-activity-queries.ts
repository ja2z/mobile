/**
 * Admin API: list user_activity rows from Postgres (replaces DynamoDB scans).
 */

import { query } from './postgres-client';

export interface ListUserActivityParams {
  page: number;
  limit: number;
  emailFilter?: string;
  eventTypeFilter?: string;
}

export interface ActivityLogApiRow {
  activityId: string;
  userId: string;
  email: string;
  eventType: string;
  timestamp: number;
  deviceId?: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
}

function mapRow(row: Record<string, unknown>): ActivityLogApiRow {
  let metadata: Record<string, unknown> | undefined;
  const raw = row.metadata;
  if (raw != null && typeof raw === 'object' && !Array.isArray(raw)) {
    metadata = raw as Record<string, unknown>;
  } else if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        metadata = parsed as Record<string, unknown>;
      }
    } catch {
      metadata = undefined;
    }
  }

  const ts = row.timestamp;
  const timestamp =
    typeof ts === 'number'
      ? ts
      : typeof ts === 'string'
        ? parseInt(ts, 10)
        : 0;

  const out: ActivityLogApiRow = {
    activityId: String(row.activity_id ?? ''),
    userId: String(row.user_id ?? ''),
    email: String(row.email ?? ''),
    eventType: String(row.event_type ?? ''),
    timestamp,
    deviceId: row.device_id != null ? String(row.device_id) : undefined,
    ipAddress: row.ip_address != null ? String(row.ip_address) : undefined,
  };
  if (metadata && Object.keys(metadata).length > 0) {
    out.metadata = metadata;
  }
  return out;
}

/**
 * Paginated activity list with optional email (substring) and event_type filters.
 */
export async function listUserActivity(
  params: ListUserActivityParams
): Promise<{ activities: ActivityLogApiRow[]; total: number; page: number; limit: number }> {
  const page = Math.max(1, Number.isFinite(params.page) ? params.page : 1);
  const rawLimit = Number.isFinite(params.limit) ? params.limit : 50;
  const limit = Math.min(Math.max(1, rawLimit), 200);
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  const emailTrim = params.emailFilter?.trim();
  if (emailTrim) {
    conditions.push(`email ILIKE $${paramIndex++}`);
    values.push(`%${emailTrim}%`);
  }

  const typeTrim = params.eventTypeFilter?.trim();
  if (typeTrim) {
    conditions.push(`event_type = $${paramIndex++}`);
    values.push(typeTrim);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countSql = `SELECT COUNT(*)::bigint AS c FROM user_activity ${whereClause}`;
  const { rows: countRows } = await query<{ c: string }>(countSql, values);
  const total = parseInt(countRows[0]?.c ?? '0', 10);

  const listSql = `
    SELECT activity_id, user_id, email, event_type, timestamp, device_id, ip_address, metadata
    FROM user_activity
    ${whereClause}
    ORDER BY timestamp DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;
  const listValues = [...values, limit, offset];
  const { rows } = await query<Record<string, unknown>>(listSql, listValues);

  return {
    activities: rows.map(mapRow),
    total,
    page,
    limit,
  };
}

export async function listDistinctEventTypes(): Promise<string[]> {
  const { rows } = await query<{ event_type: string }>(
    `SELECT DISTINCT event_type FROM user_activity
     WHERE event_type IS NOT NULL AND TRIM(event_type) <> ''
     ORDER BY event_type`
  );
  return rows.map((r) => r.event_type);
}
