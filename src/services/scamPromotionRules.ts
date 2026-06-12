import type { ReputationResult } from "./reputation";

export interface ScamPromotionDecision {
	shouldPromote: boolean;
	reason: string;
	evidenceLevel: "medium" | "high";
	riskScore: number;
}

export function decideScamPromotion(
	reputation: ReputationResult
): ScamPromotionDecision {
	if (reputation.riskScore >= 95) {
		return {
			shouldPromote: true,
			reason: "risk_score_reached_auto_promotion_threshold",
			evidenceLevel: "high",
			riskScore: reputation.riskScore
		};
	}

	if (
		reputation.signalScore >= 40 &&
		reputation.behaviorScore >= 35 &&
		reputation.attemptCount >= 6
	) {
		return {
			shouldPromote: true,
			reason: "strong_signal_and_repeated_attempt_pattern",
			evidenceLevel: "high",
			riskScore: Math.max(reputation.riskScore, 95)
		};
	}

	return {
		shouldPromote: false,
		reason: "promotion_threshold_not_met",
		evidenceLevel: "medium",
		riskScore: reputation.riskScore
	};
}
