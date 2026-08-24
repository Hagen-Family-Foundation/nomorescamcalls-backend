PRAGMA foreign_keys = OFF;

CREATE TABLE users_new (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	phone_number TEXT NOT NULL UNIQUE,
	screening_number TEXT,
	sip_username TEXT,
	first_name TEXT,
	last_name TEXT,
	caller_facing_business_name TEXT,
	email TEXT,
	carrier TEXT,
	contact_method TEXT,
	password_hash TEXT,
	role TEXT NOT NULL DEFAULT 'subscriber',
	account_status TEXT NOT NULL DEFAULT 'active',
	setup_status TEXT NOT NULL DEFAULT 'onboarding_incomplete',
	status TEXT NOT NULL DEFAULT 'active',
	coverage_status TEXT NOT NULL DEFAULT 'inactive',
	created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO users_new (
	id,
	phone_number,
	screening_number,
	sip_username,
	first_name,
	last_name,
	caller_facing_business_name,
	email,
	carrier,
	contact_method,
	password_hash,
	role,
	account_status,
	setup_status,
	status,
	coverage_status,
	created_at
)
SELECT
	id,
	phone_number,
	screening_number,
	sip_username,
	first_name,
	last_name,
	caller_facing_business_name,
	email,
	carrier,
	contact_method,
	password_hash,
	role,
	account_status,
	setup_status,
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

PRAGMA foreign_keys = ON;
