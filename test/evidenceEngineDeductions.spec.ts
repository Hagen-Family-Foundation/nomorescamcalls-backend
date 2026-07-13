import { describe, expect, it } from "vitest";
import {
	createCallEvidence
} from "../src/services/evidenceEngine";
import { applyDeduction } from "../src/services/evidenceEngine/deductions";

describe("Evidence Engine deductions", () => {
	it("applies a deduction", () => {
		const result = applyDeduction(createCallEvidence(), {
			source: "stage_1",
			reason: "test",
			points: 10
		});

		expect(result.standing).toBe(90);
		expect(result.deductions).toHaveLength(1);
		expect(result.deductions[0].source).toBe("stage_1");
	});

	it("never allows standing below zero", () => {
		const result = applyDeduction(createCallEvidence(), {
			source: "caller_response",
			reason: "large deduction",
			points: 500
		});

		expect(result.standing).toBe(0);
	});

	it("rejects negative deductions", () => {
		expect(() =>
			applyDeduction(createCallEvidence(), {
				source: "stage_1",
				reason: "bad",
				points: -1
			})
		).toThrow("Deduction points must be zero or greater.");
	});
});
