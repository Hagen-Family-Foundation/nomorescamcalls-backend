-- Permanent subscriber delivery foundation.
-- The shared Telnyx Credential Connection remains provider infrastructure;
-- each authorized device is represented by one on-demand credential.

CREATE TABLE phone_models (
	id TEXT PRIMARY KEY,
	manufacturer TEXT NOT NULL,
	display_name TEXT NOT NULL,
	platform TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'other')),
	release_year INTEGER,
	selectable INTEGER NOT NULL DEFAULT 1 CHECK (selectable IN (0, 1)),
	created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CHECK (length(trim(id)) > 0),
	CHECK (length(trim(manufacturer)) > 0),
	CHECK (length(trim(display_name)) > 0),
	CHECK (release_year IS NULL OR release_year >= 2007)
);

CREATE INDEX idx_phone_models_selector
ON phone_models(selectable, manufacturer, display_name);

INSERT INTO phone_models (
	id,
	manufacturer,
	display_name,
	platform,
	release_year,
	selectable
) VALUES (
	'other-model-not-listed',
	'Other',
	'Model Not Listed',
	'other',
	NULL,
	1
);

CREATE TABLE delivery_identities (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	protected_line_id INTEGER NOT NULL UNIQUE,
	status TEXT NOT NULL DEFAULT 'active'
		CHECK (status IN ('active', 'terminated')),
	terminated_at TEXT,
	created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (protected_line_id)
		REFERENCES protected_lines(id)
		ON DELETE RESTRICT,
	CHECK (
		(status = 'active' AND terminated_at IS NULL)
		OR (status = 'terminated' AND terminated_at IS NOT NULL)
	)
);

CREATE INDEX idx_delivery_identities_status
ON delivery_identities(status);

CREATE TABLE device_registrations (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	delivery_identity_id INTEGER NOT NULL,
	phone_model_id TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'pending'
		CHECK (status IN ('pending', 'active', 'revoked')),
	provider_telephony_credential_id TEXT NOT NULL UNIQUE,
	provider_sip_username TEXT NOT NULL UNIQUE,
	provider_credential_expires_at TEXT,
	device_authenticator_hash TEXT NOT NULL UNIQUE,
	authorized_at TEXT NOT NULL,
	activated_at TEXT,
	revoked_at TEXT,
	last_provider_verification_at TEXT,
	created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (delivery_identity_id)
		REFERENCES delivery_identities(id)
		ON DELETE RESTRICT,
	FOREIGN KEY (phone_model_id)
		REFERENCES phone_models(id)
		ON DELETE RESTRICT,
	CHECK (
		(status = 'pending' AND activated_at IS NULL AND revoked_at IS NULL)
		OR (status = 'active' AND activated_at IS NOT NULL AND revoked_at IS NULL)
		OR (status = 'revoked' AND revoked_at IS NOT NULL)
	)
);

CREATE INDEX idx_device_registrations_delivery_identity
ON device_registrations(delivery_identity_id, status);

-- Initial product policy. This partial index can be removed later if the
-- approved product policy expands to simultaneous active devices; historical
-- revoked registrations already remain representable without schema replacement.
CREATE UNIQUE INDEX idx_device_registrations_one_active
ON device_registrations(delivery_identity_id)
WHERE status = 'active';
