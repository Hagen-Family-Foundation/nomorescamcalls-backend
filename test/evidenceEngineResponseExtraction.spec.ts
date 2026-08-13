import { describe, expect, it, vi } from "vitest";
import {
	evaluateCallerResponse,
	type CallerResponseEvaluator
} from "../src/services/evidenceEngine";

describe("Evidence Engine caller response evaluator", () => {
	it("returns only caller-response facts", async () => {
		const evaluator: CallerResponseEvaluator = {
				evaluate: vi.fn().mockResolvedValue({
				nameAccepted: true,
				reasonAccepted: false,
				extractedName: "Maria",
				extractedReason: null
			})
		};

		const result = await evaluateCallerResponse(
			"This is Maria calling.",
			"en",
			evaluator
		);

		expect(result).toEqual({
			transcript: "This is Maria calling.",
			language: "en",
			nameAccepted: true,
			reasonAccepted: false,
			extractedName: "Maria",
			extractedReason: null
		});

		expect(result).not.toHaveProperty("deduction");
	});

	it("returns unusable facts without calling the evaluator when the transcript is empty", async () => {
		const evaluator: CallerResponseEvaluator = {
			evaluate: vi.fn()
		};

		const result = await evaluateCallerResponse(
			"   ",
			null,
			evaluator
		);

		expect(result).toEqual({
			transcript: "   ",
			language: null,
			nameAccepted: false,
			reasonAccepted: false,
			extractedName: null,
			extractedReason: null
		});

		expect(evaluator.evaluate).not.toHaveBeenCalled();
	});
});
