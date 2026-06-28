CREATE TABLE IF NOT EXISTS sip_credential_inventory (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	sip_username TEXT NOT NULL UNIQUE,
	status TEXT NOT NULL DEFAULT 'available',
	assigned_user_id INTEGER,
	assigned_at TEXT,
	provider TEXT NOT NULL DEFAULT 'telnyx',
	provider_credential_id TEXT,
	connection_id TEXT,
	last_synced_at TEXT,
	created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sip_credential_inventory_status
ON sip_credential_inventory(status);

CREATE INDEX IF NOT EXISTS idx_sip_credential_inventory_provider
ON sip_credential_inventory(provider);

CREATE INDEX IF NOT EXISTS idx_sip_credential_inventory_provider_credential_id
ON sip_credential_inventory(provider_credential_id);
