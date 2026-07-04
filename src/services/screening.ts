import { getChallengeProfile, type ChallengeProfile } from "./challenges";
import { decideAction, type ScreeningAction } from "./decision";
import { collectBaselineCallEvidence } from "./evidence";
import { recordCallEvent } from "./events";
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
	const evidence = await collectBaselineCallEvidence(
		phoneNumber,
		db,
		userId
	);

	if (evidence.evidenceClass === "allow_list" && evidence.allowList) {
		const action = decideAction(0);

		const result: ScreeningResult = {
			phoneNumber,
			decision: "allow",
			action: action.action,
			score: 0,
			reason: evidence.allowList.reason,
			actionReason: action.reason
		};

		await recordCallEvent(
			db,
			evidence.callerHash,
			result.decision,
			result.score,
			result.reason,
			userId
		);

		return result;
	}

	if (evidence.evidenceClass === "confirmed_scam" && evidence.confirmedScam) {
		const action = decideAction(evidence.confirmedScam.riskScore);

		const result: ScreeningResult = {
			phoneNumber,
			decision: "block",
			action: action.action,
			score: evidence.confirmedScam.riskScore,
			reason: evidence.confirmedScam.reason,
			actionReason: action.reason
		};

		await recordCallEvent(
			db,
			evidence.callerHash,
			result.decision,
			result.score,
			result.reason,
			userId
		);

		return result;
	}

	if (evidence.evidenceClass === "user_block_list" && evidence.userBlockList) {
		const action = decideAction(95);

		const result: ScreeningResult = {
			phoneNumber,
			decision: "block",
			action: action.action,
			score: 95,
			reason: evidence.userBlockList.reason,
			actionReason: action.reason
		};

		await recordCallEvent(
			db,
			evidence.callerHash,
			result.decision,
			result.score,
			result.reason,
			userId
		);

		return result;
	}

	if (!evidence.reputation) {
		throw new Error("Baseline evidence did not include reputation for unknown caller.");
	}

	const reputation = evidence.reputation;

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

	const action = decideAction(reputation.riskScore, { signalScore: reputation.signalScore });

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
		evidence.callerHash,
		result.decision,
		result.score,
		result.reason,
		userId
	);

	return result;
}
