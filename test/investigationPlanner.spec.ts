import { describe, expect, it } from "vitest";
import { planInvestigation } from "../src/services/investigationPlanner";
import type { BaselineCallEvidence } from "../src/services/evidence";

function baselineEvidence(
	evidenceClass: BaselineCallEvidence["evidenceClass"]
): BaselineCallEvidence {
	return {
		phoneNumber: "+18005551234",
		callerHash: "hash",
		userId: 1,
		evidenceClass,
		allowList: evidenceClass === "allow_list" ? { reason: "trusted" } : null,
		confirmedScam: evidenceClass === "confirmed_scam"
			? {
				callerNumber: "+18005551234",
				reason: "confirmed scam",
				evidenceLevel: "high",
				riskScore: 95,
				attemptCount: 1
			}
			: null,
		userBlockList: evidenceClass === "user_block_list" ? { reason: "blocked" } : null,
		reputation: evidenceClass === "unknown"
			? {
				callerHash: "hash",
				status: "unknown",
				riskScore: 0,
				behaviorScore: 0,
				signalScore: 0,
				attemptCount: 1
			}
			: null
	};
}

describe("investigation planning", () => {
	it("does not require additional investigation for allow list callers yet", () => {
		const plan = planInvestigation(baselineEvidence("allow_list"));

		expect(plan.requiresAdditionalEvidence).toBe(false);
		expect(plan.performAiSpokenAnalysis).toBe(false);
		expect(plan.reason).toBe("allow_list_caller_baseline_observation_only");
	});

	it("does not reinvestigate confirmed scam callers by default", () => {
		const plan = planInvestigation(baselineEvidence("confirmed_scam"));

		expect(plan.requiresAdditionalEvidence).toBe(false);
		expect(plan.reason).toBe("confirmed_scam_diversion_does_not_require_reinvestigation");
	});

	it("keeps unknown caller investigation disabled until deeper evidence providers are enabled", () => {
		const plan = planInvestigation(baselineEvidence("unknown"));

		expect(plan.requiresAdditionalEvidence).toBe(false);
		expect(plan.performAiSpokenAnalysis).toBe(false);
		expect(plan.reason).toBe("unknown_caller_additional_investigation_not_enabled_yet");
	});
});
