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
