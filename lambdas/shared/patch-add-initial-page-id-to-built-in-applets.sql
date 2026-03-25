-- Add optional default Sigma page id for built-in applet tap-to-open / embed.
-- Run on existing databases (idempotent). Also applied by lambdas/shared/run-migration.js.
ALTER TABLE built_in_applets ADD COLUMN IF NOT EXISTS initial_page_id VARCHAR(255);
