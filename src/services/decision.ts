export type ScreeningAction = "allow" | "challenge" | "block";

export interface DecisionResult {
	action: ScreeningAction;
	reason: string;
}

export function decideAction(score: number): DecisionResult {
	if (score >= 95) {
		return {
			action: "block",
			reason: "high_confidence_block"
		};
	}

	if (score >= 35) {
		return {
			action: "challenge",
			reason: "risk_challenge"
		};
	}

	return {
		action: "allow",
		reason: "low_risk_allow"
	};
}
