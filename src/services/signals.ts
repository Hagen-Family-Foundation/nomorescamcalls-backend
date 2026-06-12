import { hashPhoneNumber } from "../utils/hash";

export async function recordScamSignal(
	db: D1Database,
	phoneNumber: string,
	signalType: string,
	confidence = 1.0,
	source = "system"
): Promise<void> {
	const callerHash = await hashPhoneNumber(phoneNumber);

	await db
		.prepare(
			"INSERT INTO scam_signals (caller_hash, signal_type, confidence, source) VALUES (?, ?, ?, ?)"
		)
		.bind(
			callerHash,
			signalType,
			confidence,
			source
		)
		.run();
}


export interface ScamSignalRow {
	id: number;
	caller_hash: string;
	signal_type: string;
	confidence: number;
	source: string;
	created_at: string;
}

export async function listSignalsForCaller(
	db: D1Database,
	callerHash: string,
	limit = 25
): Promise<ScamSignalRow[]> {
	const safeLimit = Math.max(1, Math.min(limit, 100));

	const result = await db
		.prepare(`
			SELECT
				id,
				caller_hash,
				signal_type,
				confidence,
				source,
				created_at
			FROM scam_signals
			WHERE caller_hash = ?
			ORDER BY id DESC
			LIMIT ?
		`)
		.bind(callerHash, safeLimit)
		.all<ScamSignalRow>();

	return result.results;
}
