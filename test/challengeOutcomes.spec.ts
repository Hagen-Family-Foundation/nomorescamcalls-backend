import { describe, it, expect } from "vitest";
import { planChallengeOutcome } from "../src/services/challengeOutcomes";
import type { ChallengePromptPlan } from "../src/services/challengePrompts";

const challengePrompt: ChallengePromptPlan = {
	mode: "simulated",
	type: "dtmf_press",
	prompt: "Please press 5 to continue.",
	profilePrompts: ["Please state your name."],
	expectedInput: "5",
	maxAttempts: 1,
	timeoutSeconds: 5,
	costControlNote: "Test challenge prompt."
};

describe("challenge outcome planning", () => {
	it("does nothing when no challenge was required", () => {
		const result = planChallengeOutcome(null);

		expect(result.outcome).toBe("not_applicable");
		expect(result.nextCommand).toBe("noop");
	});

	it("bridges the call when the caller passes the challenge", () => {
		const result = planChallengeOutcome(challengePrompt, "5");

		expect(result.outcome).toBe("passed");
		expect(result.nextCommand).toBe("bridge");
	});

	it("hangs up when the caller fails the challenge", () => {
		const result = planChallengeOutcome(challengePrompt, "9");

		expect(result.outcome).toBe("failed");
		expect(result.nextCommand).toBe("hangup");
	});

	it("hangs up when the caller gives no input", () => {
		const result = planChallengeOutcome(challengePrompt);

		expect(result.outcome).toBe("timeout");
		expect(result.nextCommand).toBe("hangup");
	});
});
