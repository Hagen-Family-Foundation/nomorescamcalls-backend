ALTER TABLE users RENAME COLUMN app_identity TO sip_username;

DROP INDEX IF EXISTS idx_users_app_identity;

CREATE UNIQUE INDEX idx_users_sip_username
ON users(sip_username);

ALTER TABLE telnyx_webhook_events RENAME COLUMN approved_app_identity TO approved_sip_username;
