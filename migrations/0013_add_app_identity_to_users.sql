ALTER TABLE users ADD COLUMN app_identity TEXT;

CREATE UNIQUE INDEX idx_users_app_identity
ON users(app_identity);
