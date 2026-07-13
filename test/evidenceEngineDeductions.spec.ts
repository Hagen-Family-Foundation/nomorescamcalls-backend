import { describe, expect, it } from "vitest";
import { applyDeduction } from "../src/services/evidenceEngine/deductions";
import type { CallEvidence } from "../src/services/evidenceEngine";

describe("Evidence Engine deductions", () => {
	function createCall(): CallEvidence {
		return {
			standing: 100,
			deductions: [],
			ipqsRequested: false,
			ipqsCompleted: false,
			released: false,
			observing: false
		};
	}

	it("applies a deduction", () => {
		const result = applyDeduction(createCall(), {
			reason: "test",
			points: 10
		});

		expect(result.standing).toBe(90);
		expect(result.deductions).toHaveLength(1);
	});

	it("never allows standing below zero", () => {
		const result = applyDeduction(createCall(), {
			reason: "large deduction",
			points: 500
		});

		expect(result.standing).toBe(0);
	});

	it("rejects negative deductions", () => {
		expect(() =>
			applyDeduction(createCall(), {
				reason: "bad",
				points: -1
			})
		).toThrow("Deduction points must be zero or greater.");
	});
});
