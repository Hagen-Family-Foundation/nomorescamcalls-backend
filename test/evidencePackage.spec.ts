import { describe, expect, it } from "vitest";
import {
	buildCallEvidencePackage,
	type CallEvidencePackage
} from "../src/services/evidencePackage";
import type { BaselineCallEvidence } from "../src/services/evidence";
import type { InvestigationPlan } from "../src/services/investigationPlanner";

describe("Call evidence package", () => {
	it("groups baseline evidence, investigation plan, and AI investigation report", () => {
		const baselineEvidence: BaselineCallEvidence = {
			phoneNumber: "+18005551234",
			callerHash: "caller-hash",
			userId: 1,
			evidenceClass: "unknown",
			allowList: null,
			confirmedScam: null,
			userBlockList: null,
			reputation: null
		};

		const investigationPlan: InvestigationPlan = {
			requiresAdditionalEvidence: false,
			performAiSpokenAnalysis: false,
			performVoiceTranscription: false,
			performIpqsLookup: false,
			performStirShakenValidation: false,
			reason: "unknown_caller_additional_investigation_not_enabled_yet"
		};

		const evidencePackage: CallEvidencePackage = buildCallEvidencePackage(
			baselineEvidence,
			investigationPlan
		);

		expect(evidencePackage.baselineEvidence).toBe(baselineEvidence);
		expect(evidencePackage.investigationPlan).toBe(investigationPlan);
		expect(evidencePackage.aiInvestigationReport).toBeNull();
	});
});
