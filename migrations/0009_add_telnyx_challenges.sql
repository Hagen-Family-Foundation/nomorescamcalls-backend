CREATE TABLE telnyx_challenges (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	call_session_id TEXT NOT NULL UNIQUE,
	call_control_id TEXT NOT NULL,
	expected_input TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'pending',
	created_at TEXT DEFAULT CURRENT_TIMESTAMP,
	updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
