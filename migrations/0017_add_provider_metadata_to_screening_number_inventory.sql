ALTER TABLE screening_number_inventory ADD COLUMN provider TEXT NOT NULL DEFAULT 'telnyx';
ALTER TABLE screening_number_inventory ADD COLUMN provider_number_id TEXT;
ALTER TABLE screening_number_inventory ADD COLUMN voice_application_id TEXT;
ALTER TABLE screening_number_inventory ADD COLUMN connection_id TEXT;
ALTER TABLE screening_number_inventory ADD COLUMN last_synced_at TEXT;

CREATE INDEX IF NOT EXISTS idx_screening_number_inventory_provider
ON screening_number_inventory(provider);

CREATE INDEX IF NOT EXISTS idx_screening_number_inventory_provider_number_id
ON screening_number_inventory(provider_number_id);
