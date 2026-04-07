-- Add advanced config columns to applets table for Sigma REST API and page footer
ALTER TABLE applets ADD COLUMN IF NOT EXISTS sigma_api_base_url TEXT;
ALTER TABLE applets ADD COLUMN IF NOT EXISTS rest_api_same_as_embed BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE applets ADD COLUMN IF NOT EXISTS page_footer_config JSONB;

COMMENT ON COLUMN applets.sigma_api_base_url IS 'Sigma REST API base URL (e.g. https://api.sigmacomputing.com)';
COMMENT ON COLUMN applets.rest_api_same_as_embed IS 'When true, REST API credentials are the same as embed credentials';
COMMENT ON COLUMN applets.page_footer_config IS 'JSON config for custom page footer: { pages: [{ pageId, name, showInFooter, emoji }] }';
