export interface TelnyxChallengeRecord {
	userId: number | null;
	callSessionId: string;
	callControlId: string;
	expectedInput: string;
	status: string;
}

export async function saveTelnyxChallenge(
	db: D1Database,
	callSessionId: string,
	callControlId: string,
	expectedInput: string,
	userId: number | null = null
): Promise<void> {
	await db
		.prepare(`
			INSERT INTO telnyx_challenges (
				user_id,
				call_session_id,
				call_control_id,
				expected_input,
				status
			)
			VALUES (?, ?, ?, ?, 'pending')
			ON CONFLICT(call_session_id) DO UPDATE SET
				user_id = excluded.user_id,
				call_control_id = excluded.call_control_id,
				expected_input = excluded.expected_input,
				status = 'pending',
				updated_at = CURRENT_TIMESTAMP
		`)
		.bind(
			userId,
			callSessionId,
			callControlId,
			expectedInput
		)
		.run();
}

export async function getTelnyxChallenge(
	db: D1Database,
	callSessionId: string
): Promise<TelnyxChallengeRecord | null> {
	const row = await db
		.prepare(`
			SELECT
				user_id,
				call_session_id,
				call_control_id,
				expected_input,
				status
			FROM telnyx_challenges
			WHERE call_session_id = ?
		`)
		.bind(callSessionId)
		.first<{
			user_id: number | null;
			call_session_id: string;
			call_control_id: string;
			expected_input: string;
			status: string;
		}>();

	if (!row) {
		return null;
	}

	return {
		userId: row.user_id,
		callSessionId: row.call_session_id,
		callControlId: row.call_control_id,
		expectedInput: row.expected_input,
		status: row.status
	};
}

export async function updateTelnyxChallengeStatus(
	db: D1Database,
	callSessionId: string,
	status: string
): Promise<void> {
	await db
		.prepare(`
			UPDATE telnyx_challenges
			SET
				status = ?,
				updated_at = CURRENT_TIMESTAMP
			WHERE call_session_id = ?
		`)
		.bind(
			status,
			callSessionId
		)
		.run();
}
