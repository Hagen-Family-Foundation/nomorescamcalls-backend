import { describe, expect, it } from "vitest";
import { aggregateEvidenceFindings } from "../src/services/evidenceAggregator";
import type { EvidenceFinding } from "../src/services/evidenceFinding";

describe("Evidence aggregator", () => {
	it("summarizes an empty evidence set", () => {
		const summary = aggregateEvidenceFindings([]);

		expect(summary.supportsLegitimacy).toEqual([]);
		expect(summary.supportsSuspicion).toEqual([]);
		expect(summary.neutral).toEqual([]);
		expect(summary.conflictingEvidence).toBe(false);
		expect(summary.averageConfidence).toBe(0);
		expect(summary.remainingUncertainty).toBe(1);
		expect(summary.summary).toBe("No evidence findings were available.");
	});

	it("groups findings by evidence direction", () => {
		const legitimacyFinding: EvidenceFinding = {
			type: "caller_stated_name",
			description: "Caller stated a name.",
			direction: "supports_legitimacy",
			confidence: 0.7
		};

		const suspicionFinding: EvidenceFinding = {
			type: "caller_evaded_identity",
			description: "Caller avoided identity questions.",
			direction: "supports_suspicion",
			confidence: 0.9
		};

		const neutralFinding: EvidenceFinding = {
			type: "transcript_available",
			description: "Transcript was available.",
			direction: "neutral",
			confidence: 1
		};

		const summary = aggregateEvidenceFindings([
			legitimacyFinding,
			suspicionFinding,
			neutralFinding
		]);

		expect(summary.supportsLegitimacy).toEqual([legitimacyFinding]);
		expect(summary.supportsSuspicion).toEqual([suspicionFinding]);
		expect(summary.neutral).toEqual([neutralFinding]);
		expect(summary.conflictingEvidence).toBe(true);
		expect(summary.averageConfidence).toBeCloseTo(0.866, 2);
		expect(summary.remainingUncertainty).toBeCloseTo(0.133, 2);
		expect(summary.summary).toBe(
			"Evidence contains both legitimacy-supporting and suspicion-supporting findings."
		);
	});
});
