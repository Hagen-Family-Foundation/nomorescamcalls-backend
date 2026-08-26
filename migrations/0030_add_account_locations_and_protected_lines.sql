-- Permanent subscriber architecture:
--   customer account (users) -> account location -> protected line
--
-- Existing user-level telephony columns are intentionally preserved and are
-- not backfilled into the new tables. Production mappings cannot be inferred
-- safely. All new operational paths use the normalized tables below.

ALTER TABLE users
ADD COLUMN contact_phone_number TEXT;

CREATE TABLE account_locations (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id INTEGER NOT NULL,
	created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (user_id)
		REFERENCES users(id)
		ON DELETE CASCADE,
	UNIQUE(id, user_id)
);

CREATE INDEX idx_account_locations_user_id
ON account_locations(user_id);

CREATE TABLE protected_lines (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id INTEGER NOT NULL,
	location_id INTEGER NOT NULL,
	protected_phone_number TEXT NOT NULL UNIQUE,
	caller_facing_business_name TEXT NOT NULL,
	carrier TEXT,
	screening_number TEXT UNIQUE,
	sip_username TEXT UNIQUE,
	provisioning_status TEXT NOT NULL DEFAULT 'unprovisioned'
		CHECK (provisioning_status IN ('unprovisioned', 'provisioned', 'failed')),
	coverage_status TEXT NOT NULL DEFAULT 'inactive'
		CHECK (coverage_status IN ('inactive', 'active')),
	created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (user_id)
		REFERENCES users(id)
		ON DELETE CASCADE,
	FOREIGN KEY (location_id, user_id)
		REFERENCES account_locations(id, user_id)
		ON DELETE CASCADE,
	UNIQUE(id, user_id),
	CHECK (length(trim(protected_phone_number)) > 0),
	CHECK (length(trim(caller_facing_business_name)) > 0)
);

CREATE INDEX idx_protected_lines_user_id
ON protected_lines(user_id);

CREATE INDEX idx_protected_lines_location_id
ON protected_lines(location_id);

CREATE INDEX idx_protected_lines_provisioning_status
ON protected_lines(provisioning_status);

CREATE INDEX idx_protected_lines_coverage_status
ON protected_lines(coverage_status);

ALTER TABLE screening_number_inventory
ADD COLUMN assigned_protected_line_id INTEGER
	REFERENCES protected_lines(id)
	ON DELETE SET NULL;

CREATE UNIQUE INDEX idx_screening_inventory_protected_line
ON screening_number_inventory(assigned_protected_line_id)
WHERE assigned_protected_line_id IS NOT NULL;

ALTER TABLE sip_credential_inventory
ADD COLUMN assigned_protected_line_id INTEGER
	REFERENCES protected_lines(id)
	ON DELETE SET NULL;

CREATE UNIQUE INDEX idx_sip_inventory_protected_line
ON sip_credential_inventory(assigned_protected_line_id)
WHERE assigned_protected_line_id IS NOT NULL;

ALTER TABLE call_events
ADD COLUMN protected_line_id INTEGER
	REFERENCES protected_lines(id)
	ON DELETE RESTRICT;

CREATE INDEX idx_call_events_protected_line_id
ON call_events(protected_line_id);

ALTER TABLE evidence_library_calls
ADD COLUMN protected_line_id INTEGER
	REFERENCES protected_lines(id)
	ON DELETE RESTRICT;

CREATE INDEX idx_evidence_library_protected_line_id
ON evidence_library_calls(protected_line_id);

-- One controlled administrative/support/compliance account-review gate.
-- Reviewer identity comes from an authenticated portal session. Review
-- sessions and meaningful read/write events form the permanent audit trail.

CREATE TABLE administrative_review_sessions (
	id TEXT PRIMARY KEY,
	reviewer_user_id INTEGER NOT NULL,
	reviewer_role TEXT NOT NULL,
	account_user_id INTEGER NOT NULL,
	initial_protected_line_id INTEGER,
	started_at TEXT NOT NULL,
	ended_at TEXT,
	FOREIGN KEY (reviewer_user_id)
		REFERENCES users(id)
		ON DELETE RESTRICT,
	FOREIGN KEY (account_user_id)
		REFERENCES users(id)
		ON DELETE RESTRICT,
	FOREIGN KEY (initial_protected_line_id, account_user_id)
		REFERENCES protected_lines(id, user_id)
		ON DELETE RESTRICT,
	UNIQUE(id, reviewer_user_id, account_user_id),
	CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE INDEX idx_administrative_review_sessions_reviewer
ON administrative_review_sessions(reviewer_user_id, started_at);

CREATE INDEX idx_administrative_review_sessions_account
ON administrative_review_sessions(account_user_id, started_at);

CREATE TABLE administrative_review_events (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	review_session_id TEXT NOT NULL,
	reviewer_user_id INTEGER NOT NULL,
	account_user_id INTEGER NOT NULL,
	protected_line_id INTEGER,
	event_type TEXT NOT NULL
		CHECK (event_type IN ('read', 'write')),
	resource_section TEXT NOT NULL,
	action TEXT NOT NULL,
	field_name TEXT,
	prior_value TEXT,
	resulting_value TEXT,
	created_at TEXT NOT NULL,
	FOREIGN KEY (
		review_session_id,
		reviewer_user_id,
		account_user_id
	)
		REFERENCES administrative_review_sessions(
			id,
			reviewer_user_id,
			account_user_id
		)
		ON DELETE RESTRICT,
	FOREIGN KEY (protected_line_id, account_user_id)
		REFERENCES protected_lines(id, user_id)
		ON DELETE RESTRICT
);

CREATE INDEX idx_administrative_review_events_session
ON administrative_review_events(review_session_id, created_at);

CREATE INDEX idx_administrative_review_events_account
ON administrative_review_events(account_user_id, created_at);

CREATE INDEX idx_administrative_review_events_line
ON administrative_review_events(protected_line_id, created_at);
