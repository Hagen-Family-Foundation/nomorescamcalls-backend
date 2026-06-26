ALTER TABLE users ADD COLUMN full_name TEXT;
ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users ADD COLUMN coverage_status TEXT NOT NULL DEFAULT 'active';

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email
ON users(email)
WHERE email IS NOT NULL;
