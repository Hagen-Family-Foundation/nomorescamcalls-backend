CREATE TABLE IF NOT EXISTS screening_number_inventory (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	phone_number TEXT NOT NULL UNIQUE,
	status TEXT NOT NULL DEFAULT 'available',
	assigned_user_id INTEGER,
	assigned_at TEXT,
	created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_screening_number_inventory_status
ON screening_number_inventory(status);
