-- Retire individual beta invitations and credentials while preserving exact-line
-- forwarding communication history.

PRAGMA foreign_keys = OFF;

CREATE TABLE customer_communication_deliveries_new (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id INTEGER NOT NULL,
	protected_line_id INTEGER NOT NULL,
	purpose TEXT NOT NULL DEFAULT 'forwarding_instructions'
		CHECK (purpose = 'forwarding_instructions'),
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
	FOREIGN KEY (user_id)
		REFERENCES users(id)
		ON DELETE RESTRICT,
	FOREIGN KEY (protected_line_id, user_id)
		REFERENCES protected_lines(id, user_id)
		ON DELETE RESTRICT,
	CHECK (length(trim(destination)) > 0),
	CHECK (length(trim(message_body)) > 0)
);

INSERT INTO customer_communication_deliveries_new (
	id,
	user_id,
	protected_line_id,
	purpose,
	channel,
	destination,
	subject,
	message_body,
	status,
	provider,
	provider_message_id,
	failure_reason,
	attempted_at,
	sent_at,
	created_at,
	updated_at
)
SELECT
	id,
	user_id,
	protected_line_id,
	purpose,
	channel,
	destination,
	subject,
	message_body,
	status,
	provider,
	provider_message_id,
	failure_reason,
	attempted_at,
	sent_at,
	created_at,
	updated_at
FROM customer_communication_deliveries
WHERE purpose = 'forwarding_instructions'
	AND user_id IS NOT NULL
	AND protected_line_id IS NOT NULL;

DROP TABLE customer_communication_deliveries;
ALTER TABLE customer_communication_deliveries_new
	RENAME TO customer_communication_deliveries;

CREATE INDEX idx_customer_communication_line
ON customer_communication_deliveries(
	protected_line_id,
	purpose,
	created_at
);

CREATE INDEX idx_customer_communication_status
ON customer_communication_deliveries(status, created_at);

DROP TABLE beta_invite_codes;
DROP TABLE beta_invitations;

PRAGMA foreign_keys = ON;
