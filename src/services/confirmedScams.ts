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


export interface ConfirmedScamNumberRow {
	id: number;
	caller_number: string;
	reason: string;
	evidence_level: string;
	risk_score: number;
	attempt_count: number;
	first_seen: string;
	last_seen: string;
}

export async function listConfirmedScamNumbers(
	db: D1Database,
	limit = 25
): Promise<ConfirmedScamNumberRow[]> {
	const safeLimit = Math.max(1, Math.min(limit, 100));

	const result = await db
		.prepare(`
			SELECT
				id,
				caller_number,
				reason,
				evidence_level,
				risk_score,
				attempt_count,
				first_seen,
				last_seen
			FROM confirmed_scam_numbers
			ORDER BY id DESC
			LIMIT ?
		`)
		.bind(safeLimit)
		.all<ConfirmedScamNumberRow>();

	return result.results;
}


export async function removeConfirmedScamNumber(
	db: D1Database,
	phoneNumber: string
): Promise<boolean> {
	const result = await db
		.prepare(
			"DELETE FROM confirmed_scam_numbers WHERE caller_number = ?"
		)
		.bind(phoneNumber)
		.run();

	return result.meta.changes > 0;
}
