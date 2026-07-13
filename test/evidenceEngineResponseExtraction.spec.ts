import { describe, expect, it, vi } from "vitest";
import {
	evaluateCallerResponse,
	type CallerResponseEvaluator
} from "../src/services/evidenceEngine";

describe("Evidence Engine caller response evaluation", () => {
	it("returns no deduction when both answers satisfy the request", async () => {
		const evaluator: CallerResponseEvaluator = {
			evaluate: vi.fn().mockResolvedValue({
				name: "Maria",
				reason: "Calling about the appointment",
				nameAccepted: true,
				reasonAccepted: true
			})
		};

		const result = await evaluateCallerResponse(
			"This is Maria calling about the appointment.",
			"en",
			evaluator
		);

		expect(result).toEqual({
			transcript: "This is Maria calling about the appointment.",
			language: "en",
			name: "Maria",
			reason: "Calling about the appointment",
			nameAccepted: true,
			reasonAccepted: true,
			deduction: 0
		});
	});

	it("deducts fifteen points for each unacceptable answer", async () => {
		const evaluator: CallerResponseEvaluator = {
			evaluate: vi.fn().mockResolvedValue({
				name: null,
				reason: "Calling about something",
				nameAccepted: false,
				reasonAccepted: false
			})
		};

		const result = await evaluateCallerResponse(
			"Calling about something.",
			"en",
			evaluator
		);

		expect(result.deduction).toBe(30);
	});

	it("fails both requested parts when the transcript is empty", async () => {
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
			name: null,
			reason: null,
			nameAccepted: false,
			reasonAccepted: false,
			deduction: 30
		});

		expect(evaluator.evaluate).not.toHaveBeenCalled();
	});
});
