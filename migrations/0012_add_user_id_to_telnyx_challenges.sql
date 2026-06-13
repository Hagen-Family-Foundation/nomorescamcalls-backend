ALTER TABLE telnyx_challenges ADD COLUMN user_id INTEGER;

CREATE INDEX idx_telnyx_challenges_user_id
ON telnyx_challenges(user_id);
