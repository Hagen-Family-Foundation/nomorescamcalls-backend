-- Complete the customer activation lifecycle without inferring communication
-- capability or forwarding state for existing records.

ALTER TABLE users
ADD COLUMN sms_contact_number TEXT;

ALTER TABLE users
ADD COLUMN sms_capable INTEGER NOT NULL DEFAULT 0
	CHECK (sms_capable IN (0, 1))
	CHECK (
		sms_capable = 0
		OR (
			sms_contact_number IS NOT NULL
			AND length(trim(sms_contact_number)) > 0
		)
	);

ALTER TABLE protected_lines
ADD COLUMN forwarding_status TEXT NOT NULL DEFAULT 'not_started'
	CHECK (forwarding_status IN (
		'not_started',
		'awaiting_confirmation',
		'confirmed'
	));

ALTER TABLE protected_lines
ADD COLUMN resources_provisioned_at TEXT;

ALTER TABLE protected_lines
ADD COLUMN forwarding_instructions_created_at TEXT;

ALTER TABLE protected_lines
ADD COLUMN forwarding_confirmed_at TEXT;

ALTER TABLE protected_lines
ADD COLUMN activated_at TEXT;

CREATE INDEX idx_protected_lines_forwarding_status
ON protected_lines(forwarding_status);

CREATE TABLE beta_invitations (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	response_token TEXT NOT NULL UNIQUE,
	sms_contact_number TEXT,
	sms_capable INTEGER NOT NULL DEFAULT 0
		CHECK (sms_capable IN (0, 1)),
	email_contact TEXT,
	selected_channel TEXT NOT NULL
		CHECK (selected_channel IN ('sms', 'email')),
	selected_destination TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'awaiting_response'
		CHECK (status IN (
			'awaiting_response',
			'credential_issued',
			'redeemed',
			'expired',
			'cancelled'
		)),
	created_by_user_id INTEGER NOT NULL,
	issued_at TEXT NOT NULL,
	awaiting_response_at TEXT NOT NULL,
	response_received_at TEXT,
	accepted_at TEXT,
	credential_issued_at TEXT,
	redeemed_at TEXT,
	expires_at TEXT,
	created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (created_by_user_id)
		REFERENCES users(id)
		ON DELETE RESTRICT,
	CHECK (length(trim(response_token)) > 0),
	CHECK (length(trim(selected_destination)) > 0),
	CHECK (
		(selected_channel = 'sms'
			AND sms_capable = 1
			AND sms_contact_number IS NOT NULL
			AND selected_destination = sms_contact_number)
		OR
		(selected_channel = 'email'
			AND email_contact IS NOT NULL
			AND selected_destination = email_contact)
	),
	CHECK (credential_issued_at IS NULL OR accepted_at IS NOT NULL),
	CHECK (redeemed_at IS NULL OR credential_issued_at IS NOT NULL)
);

CREATE INDEX idx_beta_invitations_status
ON beta_invitations(status, created_at);

CREATE INDEX idx_beta_invitations_destination
ON beta_invitations(selected_channel, selected_destination, status);

CREATE UNIQUE INDEX idx_beta_invitations_one_awaiting_destination
ON beta_invitations(selected_channel, selected_destination)
WHERE status = 'awaiting_response';

ALTER TABLE beta_invite_codes
ADD COLUMN invitation_id INTEGER
	REFERENCES beta_invitations(id)
	ON DELETE RESTRICT;

CREATE UNIQUE INDEX idx_beta_invite_codes_invitation_id
ON beta_invite_codes(invitation_id)
WHERE invitation_id IS NOT NULL;

CREATE TABLE customer_communication_deliveries (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	invitation_id INTEGER,
	user_id INTEGER,
	protected_line_id INTEGER,
	purpose TEXT NOT NULL
		CHECK (purpose IN (
			'beta_invitation',
			'onboarding_credential',
			'forwarding_instructions'
		)),
	channel TEXT NOT NULL
		CHECK (channel IN ('sms', 'email')),
	destination TEXT NOT NULL,
	subject TEXT,
	message_body TEXT NOT NULL,
	status TEXT NOT NULL
		CHECK (status IN (
			'provider_unavailable',
			'pending',
			'sent',
			'failed'
		)),
	provider TEXT,
	provider_message_id TEXT,
	failure_reason TEXT,
	attempted_at TEXT,
	sent_at TEXT,
	created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (invitation_id)
		REFERENCES beta_invitations(id)
		ON DELETE RESTRICT,
	FOREIGN KEY (user_id)
		REFERENCES users(id)
		ON DELETE RESTRICT,
	FOREIGN KEY (protected_line_id, user_id)
		REFERENCES protected_lines(id, user_id)
		ON DELETE RESTRICT,
	CHECK (length(trim(destination)) > 0),
	CHECK (length(trim(message_body)) > 0),
	CHECK (
		(purpose IN ('beta_invitation', 'onboarding_credential')
			AND invitation_id IS NOT NULL
			AND protected_line_id IS NULL)
		OR
		(purpose = 'forwarding_instructions'
			AND invitation_id IS NULL
			AND user_id IS NOT NULL
			AND protected_line_id IS NOT NULL)
	)
);

CREATE INDEX idx_customer_communication_invitation
ON customer_communication_deliveries(invitation_id, purpose, created_at);

CREATE INDEX idx_customer_communication_line
ON customer_communication_deliveries(protected_line_id, purpose, created_at);

CREATE INDEX idx_customer_communication_status
ON customer_communication_deliveries(status, created_at);
