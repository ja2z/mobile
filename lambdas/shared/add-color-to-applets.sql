-- Add per-applet accent color column used by the My Apps color picker.
-- Stores resolved hex (#RRGGBB, uppercase). NULL means "use default accent".
ALTER TABLE applets ADD COLUMN IF NOT EXISTS color VARCHAR(50);
COMMENT ON COLUMN applets.color IS 'User-selected accent color for this applet, #RRGGBB; NULL = default';
