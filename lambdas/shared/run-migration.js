#!/usr/bin/env node
/**
 * Run Postgres migration for sigma_org_config and built_in_applets
 * Usage: node run-migration.js
 * Requires: AWS credentials, POSTGRES_SECRET_NAME or mobile-app/postgres-credentials
 */

const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { Pool } = require('pg');

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS sigma_org_config (
    slug VARCHAR(100) NOT NULL PRIMARY KEY,
    domain VARCHAR(255) NOT NULL,
    client_id VARCHAR(255) NOT NULL,
    secret_name VARCHAR(255) NOT NULL,
    add_embed_suffix BOOLEAN NOT NULL DEFAULT true,
    teams JSONB,
    user_attributes JSONB,
    account_type VARCHAR(100),
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS built_in_applets (
    applet_id VARCHAR(255) NOT NULL PRIMARY KEY,
    slug VARCHAR(100) NOT NULL REFERENCES sigma_org_config(slug),
    list_screen VARCHAR(100) NOT NULL,
    target_screen VARCHAR(100) NOT NULL,
    app_name VARCHAR(100),
    name VARCHAR(255) NOT NULL,
    subtitle VARCHAR(255),
    workbook_id VARCHAR(255),
    embed_path VARCHAR(100) NOT NULL DEFAULT 'workbook',
    icon_name VARCHAR(100),
    color VARCHAR(50),
    sort_order INT NOT NULL DEFAULT 0,
    teams JSONB,
    user_attributes JSONB,
    account_type VARCHAR(100),
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_built_in_applets_list_screen ON built_in_applets(list_screen);
CREATE INDEX IF NOT EXISTS idx_built_in_applets_app_name ON built_in_applets(app_name);
CREATE INDEX IF NOT EXISTS idx_built_in_applets_slug ON built_in_applets(slug);
`;

const SEED_SQL = `
INSERT INTO sigma_org_config (slug, domain, client_id, secret_name, add_embed_suffix, teams, user_attributes, account_type, created_at, updated_at)
VALUES 
  ('sigma-on-sigma', 'https://staging.sigmacomputing.io', '227618a72fff29baf535f3218c125a31567899d4c394fa1a78ff0d3b05cd3863', 'mobile-app/jwt-secret-sos', false, null, null, null, extract(epoch from now())::bigint * 1000, extract(epoch from now())::bigint * 1000),
  ('papercrane-embedding-gcp', 'https://app.sigmacomputing.com', 'ff917c5524fa296ed349ea375657ccc721765ff12b0e276cc3cd5873812c4355', 'sigma/jwt-secret', true, '["all_clients_team","acme_team"]'::jsonb, '{"merchant_id":"{{merchant_id}}"}'::jsonb, 'Creator', extract(epoch from now())::bigint * 1000, extract(epoch from now())::bigint * 1000),
  ('papercranestaging', 'https://staging.sigmacomputing.io', '6a7146e4be37a736b19eb598a42d21ce6f5bfcea4beb4441c83266f96dc8ed2e', 'mobile-app/jwt-secret-papercranestaging', true, '["all_clients_team"]'::jsonb, null, 'Creator', extract(epoch from now())::bigint * 1000, extract(epoch from now())::bigint * 1000),
  ('demeng', 'https://app.sigmacomputing.com', '9e1426b8908b69c1204f9740630fb7851f43e8626c3ef01bb120c84cf92f61d8', 'mobile-app/jwt-secret-demeng', true, '["all_clients_team"]'::jsonb, null, 'Creator', extract(epoch from now())::bigint * 1000, extract(epoch from now())::bigint * 1000)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO built_in_applets (applet_id, slug, list_screen, target_screen, app_name, name, subtitle, workbook_id, embed_path, icon_name, color, sort_order, teams, user_attributes, account_type, created_at, updated_at)
VALUES 
  ('2', 'papercrane-embedding-gcp', 'Dashboards', 'Dashboard', 'dashboard', 'Art of the Possible', 'Executive Dashboard', '6vzpQFMQkEiBIbnybiwrH3', 'workbook', 'briefcase-outline', null, 10, null, null, null, extract(epoch from now())::bigint * 1000, extract(epoch from now())::bigint * 1000),
  ('7', 'papercrane-embedding-gcp', 'Apps', 'Operations', 'operations', 'Operations', 'Workflow', '4dc63DnExwkJ9SsAzHJWBt', 'workbook', 'git-network-outline', null, 10, null, null, null, extract(epoch from now())::bigint * 1000, extract(epoch from now())::bigint * 1000),
  ('8', 'sigma-on-sigma', 'Sigmanauts', 'GenericAppletView', null, 'GTM', 'Operations', 'GTM-Operations-Mobile-ybIiXXEgE4k1rAMLt6UkB', 'workbook', 'trending-up-outline', null, 10, null, null, null, extract(epoch from now())::bigint * 1000, extract(epoch from now())::bigint * 1000),
  ('10', 'sigma-on-sigma', 'Sigmanauts', 'GenericAppletView', null, 'Ask J.A.K.E.', 'AI Assistant', '11NZoe57oPmsH1LAk0L9YX', 'workbook', 'chatbubbles-outline', null, 20, null, null, null, extract(epoch from now())::bigint * 1000, extract(epoch from now())::bigint * 1000),
  ('11', 'papercrane-embedding-gcp', 'Sigmanauts', 'GenericAppletView', null, 'BBM Usage', 'Usage Analytics', '78NllSMKt7BnpeWpAIQgqC', 'workbook', 'bar-chart-outline', null, 30, '["all_clients_team"]'::jsonb, null, null, extract(epoch from now())::bigint * 1000, extract(epoch from now())::bigint * 1000),
  ('6', 'papercranestaging', 'AI', 'GenericAppletView', null, 'AI Chat', 'Chat Element', 'chat-element-1zDqvtcRb2dDYpguvuqDNc', 'workbook', 'chatbubbles-outline', null, 20, '["all_clients_team"]'::jsonb, null, null, extract(epoch from now())::bigint * 1000, extract(epoch from now())::bigint * 1000),
  ('5', 'papercrane-embedding-gcp', 'AI', 'GenericAppletView', 'conversationalai', 'AI Query', 'AI Assistant', '5vuwQqluzlA5gmq9A82vt7', 'workbook', 'chatbubbles-outline', null, 30, null, null, null, extract(epoch from now())::bigint * 1000, extract(epoch from now())::bigint * 1000),
  ('3', 'papercrane-embedding-gcp', 'AI', 'GenericAppletView', 'ainewsletter', 'AI Newsletter', 'Content', '70xl8hMTdNeqN75p4i4dSG', 'workbook', 'sparkles-outline', null, 40, null, null, null, extract(epoch from now())::bigint * 1000, extract(epoch from now())::bigint * 1000),
  ('9', 'papercrane-embedding-gcp', 'AI', 'GenericAppletView', null, 'Ask Big Buys', 'Ask Sigma', null, 'ask', 'chatbubbles-outline', null, 10, '["acme_team","all_clients_team"]'::jsonb, '{"merchant_id":"{{merchant_id}}"}'::jsonb, null, extract(epoch from now())::bigint * 1000, extract(epoch from now())::bigint * 1000),
  ('12', 'demeng', 'Apps', 'GenericAppletView', null, 'Cold Provisions', null, '7nfuQle3nF7bY7RrOXLG1F', 'workbook', 'camera-outline', null, 10, null, null, null, extract(epoch from now())::bigint * 1000, extract(epoch from now())::bigint * 1000)
ON CONFLICT (applet_id) DO NOTHING;
`;

const PATCH_SQL = `
-- Patch icon_name and sort_order for existing rows (from original hardcoded values)
UPDATE built_in_applets SET icon_name = 'briefcase-outline', sort_order = 10 WHERE applet_id = '2';
UPDATE built_in_applets SET icon_name = 'git-network-outline', sort_order = 10 WHERE applet_id = '7';
UPDATE built_in_applets SET icon_name = 'trending-up-outline', sort_order = 10 WHERE applet_id = '8';
UPDATE built_in_applets SET icon_name = 'chatbubbles-outline', sort_order = 20 WHERE applet_id = '10';
UPDATE built_in_applets SET icon_name = 'bar-chart-outline', sort_order = 30 WHERE applet_id = '11';
UPDATE built_in_applets SET icon_name = 'chatbubbles-outline', sort_order = 10 WHERE applet_id = '9';
UPDATE built_in_applets SET icon_name = 'chatbubbles-outline', sort_order = 20 WHERE applet_id = '6';
UPDATE built_in_applets SET icon_name = 'chatbubbles-outline', sort_order = 30 WHERE applet_id = '5';
UPDATE built_in_applets SET icon_name = 'sparkles-outline', sort_order = 40 WHERE applet_id = '3';
`;

async function main() {
  const secretName = process.env.POSTGRES_SECRET_NAME || 'mobile-app/postgres-credentials';
  const region = process.env.AWS_REGION || 'us-west-2';

  console.log('Fetching credentials from Secrets Manager...');
  const sm = new SecretsManagerClient({ region });
  const { SecretString } = await sm.send(new GetSecretValueCommand({ SecretId: secretName }));
  const creds = JSON.parse(SecretString);

  const pool = new Pool({
    host: creds.host,
    port: creds.port || 5432,
    database: creds.database || 'mobile_app',
    user: creds.username,
    password: creds.password,
    ssl: creds.ssl !== false ? { rejectUnauthorized: false } : false,
  });

  try {
    console.log('Creating tables...');
    await pool.query(SCHEMA_SQL);
    console.log('✓ Tables created');

    console.log('Seeding data...');
    await pool.query(SEED_SQL);
    console.log('✓ Seed data inserted');

    console.log('Patching icon_name and sort_order...');
    await pool.query(PATCH_SQL);
    console.log('✓ Patch applied');

    const { rows } = await pool.query('SELECT COUNT(*) as n FROM sigma_org_config');
    console.log(`\n✓ sigma_org_config: ${rows[0].n} rows`);
    const { rows: r2 } = await pool.query('SELECT COUNT(*) as n FROM built_in_applets');
    console.log(`✓ built_in_applets: ${r2[0].n} rows`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
