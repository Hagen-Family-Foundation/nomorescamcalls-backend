PRAGMA foreign_keys = OFF;

CREATE TABLE users_new (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	phone_number TEXT NOT NULL UNIQUE,
	screening_number TEXT,
	sip_username TEXT,
	first_name TEXT,
	last_name TEXT,
	email TEXT,
	carrier TEXT,
	contact_method TEXT,
	password_hash TEXT,
	role TEXT NOT NULL DEFAULT 'participant',
	account_status TEXT NOT NULL DEFAULT 'active',
	setup_status TEXT NOT NULL DEFAULT 'account_created',
	status TEXT NOT NULL DEFAULT 'active',
	coverage_status TEXT NOT NULL DEFAULT 'active',
	created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO users_new (
	id,
	phone_number,
	screening_number,
	sip_username,
	email,
	status,
	coverage_status,
	created_at
)
SELECT
	id,
	phone_number,
	screening_number,
	sip_username,
	email,
	status,
	coverage_status,
	created_at
FROM users;

DROP TABLE users;

ALTER TABLE users_new RENAME TO users;

CREATE UNIQUE INDEX idx_users_screening_number
ON users(screening_number);

CREATE UNIQUE INDEX idx_users_sip_username
ON users(sip_username);

CREATE UNIQUE INDEX idx_users_email
ON users(email)
WHERE email IS NOT NULL;

CREATE INDEX idx_users_account_status
ON users(account_status);

CREATE INDEX idx_users_setup_status
ON users(setup_status);

CREATE TABLE beta_invite_codes (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	code TEXT NOT NULL UNIQUE,
	status TEXT NOT NULL DEFAULT 'active',
	expires_at TEXT,
	max_uses INTEGER NOT NULL DEFAULT 1,
	use_count INTEGER NOT NULL DEFAULT 0,
	created_by_user_id INTEGER,
	created_at TEXT DEFAULT CURRENT_TIMESTAMP,
	updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (created_by_user_id)
		REFERENCES users(id)
		ON DELETE SET NULL
);

CREATE INDEX idx_beta_invite_codes_status
ON beta_invite_codes(status);

CREATE TABLE portal_sessions (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id INTEGER NOT NULL,
	token_hash TEXT NOT NULL UNIQUE,
	expires_at TEXT NOT NULL,
	last_used_at TEXT,
	revoked_at TEXT,
	created_at TEXT DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (user_id)
		REFERENCES users(id)
		ON DELETE CASCADE
);

CREATE INDEX idx_portal_sessions_user_id
ON portal_sessions(user_id);

CREATE INDEX idx_portal_sessions_expires_at
ON portal_sessions(expires_at);

CREATE TABLE beta_agreement_acceptances (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id INTEGER NOT NULL,
	agreement_version TEXT NOT NULL,
	accepted_at TEXT DEFAULT CURRENT_TIMESTAMP,
	UNIQUE(user_id, agreement_version),
	FOREIGN KEY (user_id)
		REFERENCES users(id)
		ON DELETE RESTRICT
);

CREATE INDEX idx_beta_agreement_acceptances_user_id
ON beta_agreement_acceptances(user_id);

CREATE TABLE beta_feedback (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id INTEGER NOT NULL,
	category TEXT NOT NULL,
	related_call_event_id INTEGER,
	comments TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'new',
	admin_notes TEXT,
	created_at TEXT DEFAULT CURRENT_TIMESTAMP,
	updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (user_id)
		REFERENCES users(id)
		ON DELETE RESTRICT,
	FOREIGN KEY (related_call_event_id)
		REFERENCES call_events(id)
		ON DELETE SET NULL
);

CREATE INDEX idx_beta_feedback_user_id
ON beta_feedback(user_id);

CREATE INDEX idx_beta_feedback_status
ON beta_feedback(status);

PRAGMA foreign_keys = ON;
