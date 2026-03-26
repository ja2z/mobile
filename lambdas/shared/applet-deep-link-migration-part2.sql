-- Run AFTER backfill has set deep_link_slug on every row.
-- ./scripts/psql-with-env.sh -v ON_ERROR_STOP=1 -f lambdas/shared/applet-deep-link-migration-part2.sql

ALTER TABLE applets ALTER COLUMN deep_link_slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_applets_deep_link_slug ON applets(deep_link_slug);
