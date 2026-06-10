CREATE TABLE telnyx_webhook_events (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	event_type TEXT NOT NULL,
	call_control_id TEXT,
	call_session_id TEXT,
	caller_hash TEXT,
	from_number_hash TEXT,
	to_number TEXT,
	planned_action TEXT,
	planned_command TEXT,
	created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
