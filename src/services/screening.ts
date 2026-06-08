import { recordCallEvent } from "./events";
import { updateCallerReputation } from "./reputation";
import { hashPhoneNumber } from "../utils/hash";

export type ScreeningDecision = "allow" | "block";

export interface ScreeningResult {
	phoneNumber: string;
	decision: ScreeningDecision;
	score: number;
	reason: string;
	reputation?: {
		status: string;
		riskScore: number;
		attemptCount: number;
	};
}

export async function screenPhoneNumber(
	phoneNumber: string,
	db: D1Database
): Promise<ScreeningResult> {
	const callerHash = await hashPhoneNumber(phoneNumber);

	const allowed = await db
		.prepare(
			"SELECT reason FROM allow_list WHERE phone_number = ?"
		)
		.bind(phoneNumber)
		.first<{ reason: string }>();

	if (allowed) {
		const result: ScreeningResult = {
			phoneNumber,
			decision: "allow",
			score: 0,
			reason: allowed.reason
		};

		await recordCallEvent(
			db,
			callerHash,
			result.decision,
			result.score,
			result.reason
		);

		return result;
	}

	const blocked = await db
		.prepare(
			"SELECT reason FROM block_list WHERE phone_number = ?"
		)
		.bind(phoneNumber)
		.first<{ reason: string }>();

	if (blocked) {
		const result: ScreeningResult = {
			phoneNumber,
			decision: "block",
			score: 95,
			reason: blocked.reason
		};

		await recordCallEvent(
			db,
			callerHash,
			result.decision,
			result.score,
			result.reason
		);

		return result;
	}

	const reputation = await updateCallerReputation(phoneNumber, db);

	const reason = reputation.status === "watchlist"
		? "reputation_watchlist"
		: "not_found";

	const result: ScreeningResult = {
		phoneNumber,
		decision: "allow",
		score: reputation.riskScore,
		reason,
		reputation: {
			status: reputation.status,
			riskScore: reputation.riskScore,
			attemptCount: reputation.attemptCount
		}
	};

	await recordCallEvent(
		db,
		callerHash,
		result.decision,
		result.score,
		result.reason
	);

	return result;
}