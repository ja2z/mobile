-- Tracks when the user last completed SMS verification for their current phone number.
-- Used to enforce a cooldown only when changing an existing verified number (not first-time add).

ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number_verified_at BIGINT;

-- Existing verified phones: treat as verified long enough ago that they can change immediately.
UPDATE users
SET phone_number_verified_at = EXTRACT(EPOCH FROM (NOW() - INTERVAL '15 days'))::BIGINT
WHERE phone_number IS NOT NULL
  AND phone_number_verified_at IS NULL;
