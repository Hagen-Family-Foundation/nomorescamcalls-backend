ALTER TABLE beta_invite_codes
ADD COLUMN redeemed_by_user_id INTEGER
	REFERENCES users(id)
	ON DELETE SET NULL;

CREATE INDEX idx_beta_invite_codes_redeemed_by_user_id
ON beta_invite_codes(redeemed_by_user_id);
