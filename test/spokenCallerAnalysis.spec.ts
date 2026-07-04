import { describe, expect, it } from "vitest";
import { noSpokenCallerAnalysis } from "../src/services/spokenCallerAnalysis";

describe("spoken caller analysis", () => {
	it("creates a safe not-requested result when analysis is not needed", () => {
		const result = noSpokenCallerAnalysis();

		expect(result.status).toBe("not_requested");
		expect(result.transcript).toBeNull();
		expect(result.summary).toBeNull();
		expect(result.scamIndicators).toEqual([]);
		expect(result.riskContribution).toBe(0);
		expect(result.confidence).toBe(0);
		expect(result.reason).toBe("spoken_caller_analysis_not_requested");
	});

	it("preserves the reason analysis was skipped", () => {
		const result = noSpokenCallerAnalysis("allow_list_baseline_only");

		expect(result.reason).toBe("allow_list_baseline_only");
	});
});
