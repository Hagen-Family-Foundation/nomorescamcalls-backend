import { describe, expect, it } from "vitest";
import { investigatePurpose } from "../src/services/purposeInvestigation";

describe("Purpose Investigation", () => {
	it("returns not_available when no transcript exists", () => {
		const result = investigatePurpose({
			transcript: null
		});

		expect(result.status).toBe("not_available");
		expect(result.purpose).toBeNull();
		expect(result.evidenceFindings).toEqual([]);
		expect(result.remainingUncertainty).toBe(1);
		expect(result.reason).toBe("purpose_investigation_requires_transcript");
	});

	it("returns placeholder evidence when a transcript exists", () => {
		const result = investigatePurpose({
			transcript: "I'm calling to schedule your annual inspection."
		});

		expect(result.status).toBe("completed");
		expect(result.evidenceFindings).toEqual([
			{
				type: "purpose_transcript_available",
				description:
					"Caller provided spoken material that can be reviewed for call purpose evidence.",
				direction: "neutral",
				confidence: 1
			}
		]);
		expect(result.remainingUncertainty).toBe(0.8);
		expect(result.reason).toBe("purpose_investigation_placeholder_completed");
	});
});
