import { hashPhoneNumber } from "../utils/hash";

export interface ReputationResult {
	callerHash: string;
	status: string;
	riskScore: number;
	attemptCount: number;
	signalScore: number;
}

function calculateBehaviorScore(attemptCount: number): number {
	if (attemptCount >= 10) {
		return 55;
	}

	if (attemptCount >= 6) {
		return 35;
	}

	if (attemptCount >= 3) {
		return 15;
	}

	return 0;
}

function scoreSignal(signalType: string, confidence: number): number {
	const baseScores: Record<string, number> = {
		recording: 10,
		bot: 20,
		ai_voice: 25,
		neighbor_spoofing: 25,
		bank_impersonation: 30,
		tech_support_scam: 30,
		unknown: 0
	};

	const baseScore = baseScores[signalType] ?? 5;

	return Math.round(baseScore * confidence);
}

async function calculateSignalScore(
	db: D1Database,
	callerHash: string
): Promise<number> {
	const signals = await db
		.prepare(
			"SELECT signal_type, confidence FROM scam_signals WHERE caller_hash = ?"
		)
		.bind(callerHash)
		.all<{
			signal_type: string;
			confidence: number;
		}>();

	const total = signals.results.reduce((sum, signal) => {
		return sum + scoreSignal(
			signal.signal_type,
			signal.confidence
		);
	}, 0);

	return Math.min(total, 40);
}

function calculateStatus(riskScore: number): string {
	if (riskScore >= 35) {
		return "watchlist";
	}

	return "unknown";
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
		const behaviorScore = calculateBehaviorScore(newAttemptCount);
		const signalScore = await calculateSignalScore(db, callerHash);
		const riskScore = Math.min(behaviorScore + signalScore, 95);
		const status = calculateStatus(riskScore);

		await db
			.prepare(
				"UPDATE caller_reputation SET attempt_count = ?, status = ?, risk_score = ?, last_seen = CURRENT_TIMESTAMP WHERE caller_hash = ?"
			)
			.bind(
				newAttemptCount,
				status,
				riskScore,
				callerHash
			)
			.run();

		return {
			callerHash,
			status,
			riskScore,
			attemptCount: newAttemptCount,
			signalScore
		};
	}

	const behaviorScore = calculateBehaviorScore(1);
	const signalScore = await calculateSignalScore(db, callerHash);
	const riskScore = Math.min(behaviorScore + signalScore, 95);
	const status = calculateStatus(riskScore);

	await db
		.prepare(
			"INSERT INTO caller_reputation (caller_hash, status, risk_score, attempt_count) VALUES (?, ?, ?, 1)"
		)
		.bind(
			callerHash,
			status,
			riskScore
		)
		.run();

	return {
		callerHash,
		status,
		riskScore,
		attemptCount: 1,
		signalScore
	};
}