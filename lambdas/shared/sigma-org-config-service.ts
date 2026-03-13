/**
 * Sigma Org Config Service
 * Fetches Sigma org configuration from Postgres (sigma_org_config table)
 */

import { query } from './postgres-client';

export interface SigmaOrgConfigRow {
  slug: string;
  domain: string;
  client_id: string;
  secret_name: string;
  add_embed_suffix: boolean;
  teams: string[] | null;
  user_attributes: Record<string, unknown> | null;
  account_type: string | null;
}

/**
 * Get Sigma org configuration by slug
 * Returns null if slug not found (no fallback)
 */
export async function getSigmaOrgConfigBySlug(slug: string): Promise<SigmaOrgConfigRow | null> {
  const { rows } = await query<SigmaOrgConfigRow>(
    'SELECT slug, domain, client_id, secret_name, add_embed_suffix, teams, user_attributes, account_type FROM sigma_org_config WHERE slug = $1',
    [slug]
  );
  return rows[0] ?? null;
}
