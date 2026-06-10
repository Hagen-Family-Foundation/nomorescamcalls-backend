export interface ChallengeProfile {
	name: string;
	prompts: string[];
}

export function getChallengeProfile(
	riskScore: number
): ChallengeProfile {
	if (riskScore >= 70) {
		return {
			name: "high_risk",
			prompts: [
				"Please state your name.",
				"Who are you trying to reach?",
				"What company are you calling from?"
			]
		};
	}

	if (riskScore >= 35) {
		return {
			name: "enhanced",
			prompts: [
				"Please state your name.",
				"Who are you trying to reach?"
			]
		};
	}

	return {
		name: "basic",
		prompts: [
			"Please state your name."
		]
	};
}
