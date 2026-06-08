import { hashPhoneNumber } from "../utils/hash";

export interface ReputationResult {
	callerHash: string;
	status: string;
	riskScore: number;
	attemptCount: number;
}

export async function updateCallerReputation(
	phoneNumber: string,
	db: D1Database
): Promise<ReputationResult> {
	const callerHash = await hashPhoneNumber(phoneNumber);

	const existing = await db
		.prepare(
			"SELECT caller_hash, status, risk_score, attempt_count FROM caller_reputation WHERE caller_hash = ?"
		)
		.bind(callerHash)
		.first<{
			caller_hash: string;
			status: string;
			risk_score: number;
			attempt_count: number;
		}>();

	if (existing) {
		const newAttemptCount = existing.attempt_count + 1;

		await db
			.prepare(
				"UPDATE caller_reputation SET attempt_count = ?, last_seen = CURRENT_TIMESTAMP WHERE caller_hash = ?"
			)
			.bind(newAttemptCount, callerHash)
			.run();

		return {
			callerHash,
			status: existing.status,
			riskScore: existing.risk_score,
			attemptCount: newAttemptCount
		};
	}

	await db
		.prepare(
			"INSERT INTO caller_reputation (caller_hash, status, risk_score, attempt_count) VALUES (?, 'unknown', 0, 1)"
		)
		.bind(callerHash)
		.run();

	return {
		callerHash,
		status: "unknown",
		riskScore: 0,
		attemptCount: 1
	};
}
