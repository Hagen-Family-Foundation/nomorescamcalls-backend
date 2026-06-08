import { hashPhoneNumber } from "../utils/hash";

export interface ReputationResult {
	callerHash: string;
	status: string;
	riskScore: number;
	attemptCount: number;
}

function calculateReputationScore(attemptCount: number): {
	status: string;
	riskScore: number;
} {
	if (attemptCount >= 10) {
		return {
			status: "watchlist",
			riskScore: 55
		};
	}

	if (attemptCount >= 6) {
		return {
			status: "watchlist",
			riskScore: 35
		};
	}

	if (attemptCount >= 3) {
		return {
			status: "unknown",
			riskScore: 15
		};
	}

	return {
		status: "unknown",
		riskScore: 0
	};
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
		const reputation = calculateReputationScore(newAttemptCount);

		await db
			.prepare(
				"UPDATE caller_reputation SET attempt_count = ?, status = ?, risk_score = ?, last_seen = CURRENT_TIMESTAMP WHERE caller_hash = ?"
			)
			.bind(
				newAttemptCount,
				reputation.status,
				reputation.riskScore,
				callerHash
			)
			.run();

		return {
			callerHash,
			status: reputation.status,
			riskScore: reputation.riskScore,
			attemptCount: newAttemptCount
		};
	}

	const reputation = calculateReputationScore(1);

	await db
		.prepare(
			"INSERT INTO caller_reputation (caller_hash, status, risk_score, attempt_count) VALUES (?, ?, ?, 1)"
		)
		.bind(
			callerHash,
			reputation.status,
			reputation.riskScore
		)
		.run();

	return {
		callerHash,
		status: reputation.status,
		riskScore: reputation.riskScore,
		attemptCount: 1
	};
}