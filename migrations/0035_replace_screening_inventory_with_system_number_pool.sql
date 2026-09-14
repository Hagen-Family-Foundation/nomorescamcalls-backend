-- Permanent NMSC-owned System Number allocation and replenishment state.
-- Telnyx remains authoritative for telecommunications configuration; NMSC
-- persists only allocation, verification, quarantine, and order correlation.

ALTER TABLE users
RENAME COLUMN screening_number TO system_number;

ALTER TABLE protected_lines
RENAME COLUMN screening_number TO system_number;

ALTER TABLE evidence_library_calls
RENAME COLUMN subscriber_screening_number TO subscriber_system_number;

DROP INDEX IF EXISTS idx_users_screening_number;

CREATE UNIQUE INDEX idx_users_system_number
ON users(system_number);

CREATE TABLE system_number_replenishments (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	request_key TEXT NOT NULL UNIQUE,
	provider_customer_reference TEXT NOT NULL UNIQUE,
	provider_order_id TEXT UNIQUE,
	provider_configuration_job_id TEXT UNIQUE,
	status TEXT NOT NULL
		CHECK (status IN (
			'ordering',
			'submitting_order',
			'fulfilling',
			'submitting_configuration',
			'configuring',
			'verifying',
			'finalizing',
			'completed',
			'partial',
			'failed'
		)),
	in_flight_slot INTEGER
		CHECK (in_flight_slot IS NULL OR in_flight_slot = 1),
	requested_quantity INTEGER NOT NULL DEFAULT 50
		CHECK (requested_quantity = 50),
	ready_count_at_trigger INTEGER NOT NULL
		CHECK (ready_count_at_trigger BETWEEN 0 AND 5),
	provider_allocated_count INTEGER NOT NULL DEFAULT 0
		CHECK (provider_allocated_count >= 0),
	verified_ready_count INTEGER NOT NULL DEFAULT 0
		CHECK (verified_ready_count >= 0),
	last_error TEXT,
	created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	submitted_at TEXT,
	completed_at TEXT,
	updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CHECK (
		(status IN (
			'ordering',
			'submitting_order',
			'fulfilling',
			'submitting_configuration',
			'configuring',
			'verifying',
			'finalizing'
		)
			AND in_flight_slot = 1
			AND completed_at IS NULL)
		OR
		(status IN ('completed', 'partial', 'failed')
			AND in_flight_slot IS NULL
			AND completed_at IS NOT NULL)
	)
);

CREATE UNIQUE INDEX idx_system_number_replenishment_in_flight
ON system_number_replenishments(in_flight_slot)
WHERE in_flight_slot IS NOT NULL;

CREATE INDEX idx_system_number_replenishment_status
ON system_number_replenishments(status);

CREATE TABLE system_numbers (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	provider_number_id TEXT UNIQUE,
	phone_number TEXT NOT NULL UNIQUE,
	lifecycle_state TEXT NOT NULL
		CHECK (lifecycle_state IN (
			'quarantined',
			'ready',
			'assigned',
			'ineligible'
		)),
	protected_line_id INTEGER UNIQUE,
	replenishment_id INTEGER,
	available_since TEXT,
	assigned_at TEXT,
	released_at TEXT,
	verification_state TEXT NOT NULL DEFAULT 'pending'
		CHECK (verification_state IN ('pending', 'verified', 'failed')),
	last_verified_at TEXT,
	verification_error TEXT,
	quarantine_reason TEXT,
	created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (protected_line_id)
		REFERENCES protected_lines(id)
		ON DELETE RESTRICT,
	FOREIGN KEY (replenishment_id)
		REFERENCES system_number_replenishments(id)
		ON DELETE RESTRICT,
	CHECK (
		length(phone_number) BETWEEN 8 AND 16
		AND phone_number GLOB '+[1-9][0-9]*'
		AND phone_number NOT GLOB '*[^+0-9]*'
		AND instr(substr(phone_number, 2), '+') = 0
	),
	CHECK (
		lifecycle_state != 'ready'
		OR (
			protected_line_id IS NULL
			AND available_since IS NOT NULL
			AND verification_state = 'verified'
			AND provider_number_id IS NOT NULL
			AND last_verified_at IS NOT NULL
		)
	),
	CHECK (
		lifecycle_state != 'assigned'
		OR (
			protected_line_id IS NOT NULL
			AND assigned_at IS NOT NULL
		)
	),
	CHECK (
		protected_line_id IS NULL
		OR lifecycle_state = 'assigned'
	)
);

CREATE INDEX idx_system_numbers_lifecycle_fifo
ON system_numbers(lifecycle_state, available_since, id);

CREATE INDEX idx_system_numbers_verification
ON system_numbers(verification_state, last_verified_at);

CREATE INDEX idx_system_numbers_replenishment
ON system_numbers(replenishment_id);

INSERT INTO system_numbers (
	id,
	provider_number_id,
	phone_number,
	lifecycle_state,
	protected_line_id,
	available_since,
	assigned_at,
	verification_state,
	quarantine_reason,
	created_at,
	updated_at
)
SELECT
	id,
	provider_number_id,
	phone_number,
	CASE
		WHEN phone_number = '+19135858300' THEN 'ineligible'
		WHEN assigned_protected_line_id IS NOT NULL THEN 'assigned'
		ELSE 'quarantined'
	END,
	assigned_protected_line_id,
	NULL,
	CASE
		WHEN assigned_protected_line_id IS NOT NULL
			THEN COALESCE(assigned_at, CURRENT_TIMESTAMP)
		ELSE NULL
	END,
	'pending',
	CASE
		WHEN phone_number = '+19135858300'
			THEN 'legacy_scaminater_configuration'
		WHEN phone_number = '+19139562493'
			THEN 'working_test_number'
		WHEN assigned_protected_line_id IS NOT NULL
			THEN 'assigned_number_requires_provider_verification'
		ELSE 'provider_normalization_required'
	END,
	COALESCE(created_at, CURRENT_TIMESTAMP),
	CURRENT_TIMESTAMP
FROM screening_number_inventory;

DROP TABLE screening_number_inventory;
