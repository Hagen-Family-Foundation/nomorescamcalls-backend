import { describe, expect, it } from "vitest";
import { investigateUrgency } from "../src/services/urgencyInvestigation";

describe("Urgency Investigation", () => {
	it("returns not available when no transcript exists", () => {
		const result = investigateUrgency({
			transcript: null
		});

		expect(result.status).toBe("not_available");
		expect(result.evidenceFindings).toEqual([]);
		expect(result.remainingUncertainty).toBe(1);
		expect(result.reason).toBe("urgency_requires_transcript");
	});

	it("returns placeholder urgency evidence when transcript exists", () => {
		const result = investigateUrgency({
			transcript: "You must act immediately to avoid losing your account."
		});

		expect(result.status).toBe("completed");
		expect(result.evidenceFindings).toEqual([
			{
				type: "urgency_transcript_available",
				description:
					"Caller provided spoken material that can be reviewed for urgency and pressure tactics.",
				direction: "neutral",
				confidence: 1
			}
		]);

		expect(result.remainingUncertainty).toBe(0.8);
		expect(result.reason).toBe("urgency_investigation_placeholder_completed");
	});
});
