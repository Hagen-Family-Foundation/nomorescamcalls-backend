import { env } from "cloudflare:test";

let providerSequence = 0;

export async function addReadySystemNumber(
	phoneNumber: string,
	availableSince = new Date().toISOString()
): Promise<void> {
	providerSequence += 1;
	await env.nomorescamcalls_db.prepare(`
		INSERT INTO system_numbers (
			provider_number_id,
			phone_number,
			lifecycle_state,
			available_since,
			verification_state,
			last_verified_at,
			created_at,
			updated_at
		)
		VALUES (?, ?, 'ready', ?, 'verified', ?, ?, ?)
		ON CONFLICT(phone_number) DO UPDATE SET
			lifecycle_state = 'ready',
			protected_line_id = NULL,
			available_since = excluded.available_since,
			assigned_at = NULL,
			verification_state = 'verified',
			last_verified_at = excluded.last_verified_at,
			verification_error = NULL,
			quarantine_reason = NULL,
			updated_at = excluded.updated_at
	`).bind(
		`test-provider-number-${providerSequence}`,
		phoneNumber,
		availableSince,
		availableSince,
		availableSince,
		availableSince
	).run();
}
