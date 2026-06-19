import type { ChallengePromptPlan } from "./challengePrompts";

export type ChallengeOutcome = "passed" | "failed" | "timeout" | "not_applicable";

export interface ChallengeOutcomePlan {
	mode: "simulated";
	outcome: ChallengeOutcome;
	nextCommand: "transfer" | "hangup" | "noop";
	reason: string;
}

export function planChallengeOutcome(
	challengePrompt: ChallengePromptPlan | null,
	input?: string
): ChallengeOutcomePlan {
	if (!challengePrompt) {
		return {
			mode: "simulated",
			outcome: "not_applicable",
			nextCommand: "noop",
			reason: "No challenge was required."
		};
	}

	if (!input) {
		return {
			mode: "simulated",
			outcome: "timeout",
			nextCommand: "hangup",
			reason: "Caller did not provide challenge input."
		};
	}

	if (input === challengePrompt.expectedInput) {
		return {
			mode: "simulated",
			outcome: "passed",
			nextCommand: "transfer",
			reason: "Caller provided the expected challenge input."
		};
	}

	return {
		mode: "simulated",
		outcome: "failed",
		nextCommand: "hangup",
		reason: "Caller provided incorrect challenge input."
	};
}
