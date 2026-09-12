-- Track the single post-activation confirmation call for each Protected Line.
-- This state is line-owned and does not replace forwarding confirmation or
-- the permanent Customer Communications architecture.

ALTER TABLE protected_lines
ADD COLUMN activation_confirmation_call_status TEXT NOT NULL DEFAULT 'not_started'
	CHECK (activation_confirmation_call_status IN (
		'not_started',
		'initiating',
		'initiated',
		'speaking',
		'completed',
		'failed'
	));

ALTER TABLE protected_lines
ADD COLUMN activation_confirmation_call_control_id TEXT;

ALTER TABLE protected_lines
ADD COLUMN activation_confirmation_call_initiated_at TEXT;

ALTER TABLE protected_lines
ADD COLUMN activation_confirmation_call_completed_at TEXT;

ALTER TABLE protected_lines
ADD COLUMN activation_confirmation_call_failure_reason TEXT;

CREATE INDEX idx_protected_lines_activation_confirmation_call_status
ON protected_lines(activation_confirmation_call_status, activated_at);
