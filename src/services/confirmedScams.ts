export interface ConfirmedScamNumber {
	callerNumber: string;
	reason: string;
	evidenceLevel: string;
	riskScore: number;
	attemptCount: number;
}

export async function findConfirmedScamNumber(
	db: D1Database,
	phoneNumber: string
): Promise<ConfirmedScamNumber | null> {
	const row = await db
		.prepare(`
			SELECT
				caller_number,
				reason,
				evidence_level,
				risk_score,
				attempt_count
			FROM confirmed_scam_numbers
			WHERE caller_number = ?
		`)
		.bind(phoneNumber)
		.first<{
			caller_number: string;
			reason: string;
			evidence_level: string;
			risk_score: number;
			attempt_count: number;
		}>();

	if (!row) {
		return null;
	}

	return {
		callerNumber: row.caller_number,
		reason: row.reason,
		evidenceLevel: row.evidence_level,
		riskScore: row.risk_score,
		attemptCount: row.attempt_count
	};
}
