import { describe, expect, it } from "vitest";
import { determineAction } from "../src/services/evidenceEngine/action";
import type { CallEvidence } from "../src/services/evidenceEngine";

function call(standing: number, ipqsCompleted = false): CallEvidence {
	return {
		standing,
		deductions: [],
		ipqsRequested: false,
		ipqsCompleted,
		released: false,
		observing: false
	};
}

describe("Evidence Engine action", () => {
	it("releases above the IPQS range", () => {
		expect(determineAction(call(86))).toBe("release");
	});

	it("requests IPQS within the range", () => {
		expect(determineAction(call(85))).toBe("ipqs");
		expect(determineAction(call(76))).toBe("ipqs");
	});

	it("releases after IPQS if still passing", () => {
		expect(determineAction(call(76, true))).toBe("release");
	});

	it("observes below the threshold", () => {
		expect(determineAction(call(75))).toBe("observe");
	});
});
