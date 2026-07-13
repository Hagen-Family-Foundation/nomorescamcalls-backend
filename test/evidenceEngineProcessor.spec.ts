import { describe, expect, it } from "vitest";
import { processCall } from "../src/services/evidenceEngine/processor";
import type { CallEvidence } from "../src/services/evidenceEngine";

function freshCall(): CallEvidence {
	return {
		standing: 100,
		deductions: [],
		ipqsRequested: false,
		ipqsCompleted: false,
		released: false,
		observing: false
	};
}

describe("Evidence Engine processor", () => {
	it("releases a call that remains above 85", () => {
		const result = processCall(freshCall(), [
			{ reason: "minor issue", points: 10 }
		]);

		expect(result.call.standing).toBe(90);
		expect(result.action).toBe("release");
	});

	it("requests IPQS for a call in the 76 to 85 range", () => {
		const result = processCall(freshCall(), [
			{ reason: "borderline evidence", points: 20 }
		]);

		expect(result.call.standing).toBe(80);
		expect(result.action).toBe("ipqs");
	});

	it("observes a call at 75 or below", () => {
		const result = processCall(freshCall(), [
			{ reason: "strong negative evidence", points: 25 }
		]);

		expect(result.call.standing).toBe(75);
		expect(result.action).toBe("observe");
	});
});
