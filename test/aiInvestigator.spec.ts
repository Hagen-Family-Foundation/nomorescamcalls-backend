import { describe, expect, it } from "vitest";
import { investigateCaller } from "../src/services/aiInvestigator";
import type { BaselineCallEvidence } from "../src/services/evidence";
import type { InvestigationPlan } from "../src/services/investigationPlanner";

function baselineEvidence(
	evidenceClass: BaselineCallEvidence["evidenceClass"] = "unknown"
): BaselineCallEvidence {
	return {
		phoneNumber: "+18005551234",
		callerHash: "caller-hash",
		userId: 1,
		evidenceClass,
		allowList: null,
		confirmedScam: null,
		userBlockList: null,
		reputation: null
	};
}

function investigationPlan(
	requiresAdditionalEvidence: boolean
): InvestigationPlan {
	return {
		requiresAdditionalEvidence,
		performAiSpokenAnalysis: requiresAdditionalEvidence,
		performVoiceTranscription: requiresAdditionalEvidence,
		performIpqsLookup: false,
		performStirShakenValidation: false,
		reason: requiresAdditionalEvidence
			? "unknown_caller_requires_ai_investigation"
			: "allow_list_caller_baseline_observation_only"
	};
}

describe("AI Investigator", () => {
	it("does not investigate when the plan does not request more evidence", async () => {
		const report = await investigateCaller({
			baselineEvidence: baselineEvidence("allow_list"),
			investigationPlan: investigationPlan(false),
			recordingUrl: null,
			transcript: null
		});

		expect(report.status).toBe("not_requested");
		expect(report.spokenCallerAnalysis.status).toBe("not_requested");
		expect(report.evidenceFindings).toEqual([]);
		expect(report.questionsAsked).toEqual([]);
		expect(report.unansweredQuestions).toEqual([]);
		expect(report.remainingUncertainty).toBe(0);
		expect(report.reason).toBe("allow_list_caller_baseline_observation_only");
	});

	it("returns a safe placeholder report when investigation is requested but no provider is connected", async () => {
		const report = await investigateCaller({
			baselineEvidence: baselineEvidence("unknown"),
			investigationPlan: investigationPlan(true),
			recordingUrl: "https://example.com/recording.mp3",
			transcript: null
		});

		expect(report.status).toBe("completed");
		expect(report.spokenCallerAnalysis.status).toBe("not_requested");
		expect(report.evidenceFindings).toEqual([]);
		expect(report.questionsAsked).toEqual([]);
		expect(report.identityInvestigation?.status).toBe("not_available");
		expect(report.unansweredQuestions).toEqual([
			"Identity investigation requires a transcript."
		]);
		expect(report.remainingUncertainty).toBe(1);
		expect(report.reason).toBe("ai_investigator_completed_available_internal_investigations");
	});
});
