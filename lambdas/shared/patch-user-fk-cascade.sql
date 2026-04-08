-- Referential integrity: child tables reference users(user_id) with ON DELETE CASCADE.
-- built_in_applets and sigma_org_config have no user_id — unchanged.
-- approved_emails is keyed by email only (whitelist can exist before signup) — no FK to users.

-- Remove orphan rows that would block FK creation
DELETE FROM user_activity ua
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.user_id = ua.user_id);

DELETE FROM applets a
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.user_id = a.user_id);

-- applets -> users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_applets_user_id'
  ) THEN
    ALTER TABLE applets
      ADD CONSTRAINT fk_applets_user_id
      FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE;
  END IF;
END $$;

-- user_activity -> users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_user_activity_user_id'
  ) THEN
    ALTER TABLE user_activity
      ADD CONSTRAINT fk_user_activity_user_id
      FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE;
  END IF;
END $$;
