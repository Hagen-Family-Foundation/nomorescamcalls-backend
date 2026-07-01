export type ScreeningAction = "allow" | "challenge" | "block";

export interface DecisionResult {
	action: ScreeningAction;
	reason: string;
}

export interface DecisionContext {
	signalScore?: number;
}

export function decideAction(
	score: number,
	context: DecisionContext = {}
): DecisionResult {
	if (score >= 95) {
		return {
			action: "block",
			reason: "high_confidence_block"
		};
	}

	if (score >= 35 && (context.signalScore ?? 0) > 0) {
		return {
			action: "challenge",
			reason: "risk_challenge"
		};
	}

	if (score >= 35) {
		return {
			action: "allow",
			reason: "frequency_without_suspicious_signal_allow"
		};
	}

	return {
		action: "allow",
		reason: "low_risk_allow"
	};
}
