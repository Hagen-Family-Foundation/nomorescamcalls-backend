import type { ChallengeProfile } from "./challenges";

export type ChallengePromptType = "dtmf_press" | "dtmf_press_with_retry" | "strict_verification";

export interface ChallengePromptPlan {
	mode: "simulated";
	type: ChallengePromptType;
	prompt: string;
	profilePrompts: string[];
	expectedInput: string;
	maxAttempts: number;
	timeoutSeconds: number;
	costControlNote: string;
}

export function planChallengePrompt(
	challengeProfile?: ChallengeProfile
): ChallengePromptPlan | null {
	if (!challengeProfile) {
		return null;
	}

	if (challengeProfile.name === "high_risk") {
		return {
			mode: "simulated",
			type: "strict_verification",
			prompt: "Please state your name and reason for calling.",
			profilePrompts: challengeProfile.prompts,
			expectedInput: "5",
			maxAttempts: 1,
			timeoutSeconds: 6,
			costControlNote: "High-risk callers get one short attempt to limit call time."
		};
	}

	if (challengeProfile.name === "enhanced") {
		return {
			mode: "simulated",
			type: "dtmf_press_with_retry",
			prompt: "Please state your name and reason for calling.",
			profilePrompts: challengeProfile.prompts,
			expectedInput: "5",
			maxAttempts: 2,
			timeoutSeconds: 6,
			costControlNote: "Medium-risk callers get one retry while keeping prompt time short."
		};
	}

	return {
		mode: "simulated",
		type: "dtmf_press",
		prompt: "Please state your name and reason for calling.",
		profilePrompts: challengeProfile.prompts,
		expectedInput: "5",
		maxAttempts: 1,
		timeoutSeconds: 5,
		costControlNote: "Low-risk challenges use the shortest prompt path."
	};
}
