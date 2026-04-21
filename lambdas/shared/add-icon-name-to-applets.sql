-- Add per-applet icon column used by the My Apps icon picker.
-- Stores Ionicons glyph name (e.g. "layers-outline"). NULL means "use default icon".
ALTER TABLE applets ADD COLUMN IF NOT EXISTS icon_name VARCHAR(100);
COMMENT ON COLUMN applets.icon_name IS 'User-selected Ionicons glyph name for this applet; NULL = default';
