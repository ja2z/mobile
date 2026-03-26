-- My Buys applets: globally unique deep link slug (mybuys:word-word-word)
-- Run against RDS with: ./scripts/psql-with-env.sh -v ON_ERROR_STOP=1 -f lambdas/shared/applet-deep-link-migration.sql
-- After part 1, run backfill (see scripts/backfill-applets-deep-link-slugs.sh), then part 2.

-- ========== PART 1: add column (nullable until backfill) ==========
ALTER TABLE applets ADD COLUMN IF NOT EXISTS deep_link_slug VARCHAR(512);

COMMENT ON COLUMN applets.deep_link_slug IS 'Globally unique mybuys:word-word-word identifier for deep links';

-- ========== PART 2: run after backfill fills all rows ==========
-- ALTER TABLE applets ALTER COLUMN deep_link_slug SET NOT NULL;
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_applets_deep_link_slug ON applets(deep_link_slug);
