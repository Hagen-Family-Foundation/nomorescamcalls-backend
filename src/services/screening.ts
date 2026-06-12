import { getChallengeProfile, type ChallengeProfile } from "./challenges";
import { decideAction, type ScreeningAction } from "./decision";
import { recordCallEvent } from "./events";
import { updateCallerReputation } from "./reputation";
import { hashPhoneNumber } from "../utils/hash";
import { findConfirmedScamNumber } from "./confirmedScams";
import { decideScamPromotion } from "./scamPromotionRules";
import { promoteConfirmedScamNumber } from "./scamPromotion";

export type ScreeningDecision = "allow" | "block";

export interface ScreeningResult {
	phoneNumber: string;
	decision: ScreeningDecision;
	action: ScreeningAction;
	score: number;
	reason: string;
	actionReason: string;
	challengeProfile?: ChallengeProfile;
	reputation?: {
		status: string;
		riskScore: number;
		behaviorScore: number;
		signalScore: number;
		attemptCount: number;
	};
}

export async function screenPhoneNumber(
	phoneNumber: string,
	db: D1Database,
	userId: number | null = null
): Promise<ScreeningResult> {
	const callerHash = await hashPhoneNumber(phoneNumber);

	const allowed = await db
		.prepare(
			"SELECT reason FROM allow_list WHERE phone_number = ? AND user_id IS ?"
		)
		.bind(phoneNumber, userId)
		.first<{ reason: string }>();

	if (allowed) {
		const action = decideAction(0);

		const result: ScreeningResult = {
			phoneNumber,
			decision: "allow",
			action: action.action,
			score: 0,
			reason: allowed.reason,
			actionReason: action.reason
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

	const confirmedScam = await findConfirmedScamNumber(
		db,
		phoneNumber
	);

	if (confirmedScam) {
		const action = decideAction(confirmedScam.riskScore);

		const result: ScreeningResult = {
			phoneNumber,
			decision: "block",
			action: action.action,
			score: confirmedScam.riskScore,
			reason: confirmedScam.reason,
			actionReason: action.reason
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
			"SELECT reason FROM block_list WHERE phone_number = ? AND user_id IS ?"
		)
		.bind(phoneNumber, userId)
		.first<{ reason: string }>();

	if (blocked) {
		const action = decideAction(95);

		const result: ScreeningResult = {
			phoneNumber,
			decision: "block",
			action: action.action,
			score: 95,
			reason: blocked.reason,
			actionReason: action.reason
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

	const promotion = decideScamPromotion(reputation);

	if (promotion.shouldPromote) {
		await promoteConfirmedScamNumber(
			db,
			{
				phoneNumber,
				reason: promotion.reason,
				evidenceLevel: promotion.evidenceLevel,
				riskScore: promotion.riskScore
			}
		);
	}

	const action = decideAction(reputation.riskScore);

	const result: ScreeningResult = {
		phoneNumber,
		decision: action.action === "block" ? "block" : "allow",
		action: action.action,
		score: reputation.riskScore,
		reason,
		actionReason: action.reason,
		reputation: {
			status: reputation.status,
			riskScore: reputation.riskScore,
			behaviorScore: reputation.behaviorScore,
			signalScore: reputation.signalScore,
			attemptCount: reputation.attemptCount
		}
	};

	if (action.action === "challenge") {
		result.challengeProfile = getChallengeProfile(reputation.riskScore);
	}

	await recordCallEvent(
		db,
		callerHash,
		result.decision,
		result.score,
		result.reason
	);

	return result;
}