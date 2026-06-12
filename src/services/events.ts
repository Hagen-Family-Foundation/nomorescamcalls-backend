export async function recordCallEvent(
	db: D1Database,
	callerHash: string,
	decision: string,
	score: number,
	reason: string
): Promise<void> {
	await db
		.prepare(
			"INSERT INTO call_events (caller_hash, decision, score, reason) VALUES (?, ?, ?, ?)"
		)
		.bind(
			callerHash,
			decision,
			score,
			reason
		)
		.run();
}


export interface CallEventRow {
	id: number;
	user_id: number | null;
	caller_hash: string;
	decision: string;
	score: number;
	reason: string;
	created_at: string;
}

export async function listRecentCallEventsForCaller(
	db: D1Database,
	callerHash: string,
	limit = 10
): Promise<CallEventRow[]> {
	const safeLimit = Math.max(1, Math.min(limit, 50));

	const result = await db
		.prepare(`
			SELECT
				id,
				user_id,
				caller_hash,
				decision,
				score,
				reason,
				created_at
			FROM call_events
			WHERE caller_hash = ?
			ORDER BY id DESC
			LIMIT ?
		`)
		.bind(callerHash, safeLimit)
		.all<CallEventRow>();

	return result.results;
}
