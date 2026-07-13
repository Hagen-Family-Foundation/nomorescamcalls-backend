import { describe, expect, it } from "vitest";
import {
	createCallEvidence,
	INITIAL_CALL_STANDING
} from "../src/services/evidenceEngine";

describe("Evidence Engine call state", () => {
	it("creates a fresh independent call state", () => {
		const call = createCallEvidence();

		expect(call).toEqual({
			standing: INITIAL_CALL_STANDING,
			deductions: [],
			ipqsRequested: false,
			ipqsCompleted: false,
			released: false,
			observing: false
		});
	});

	it("does not share deductions between calls", () => {
		const firstCall = createCallEvidence();
		const secondCall = createCallEvidence();

		firstCall.deductions.push({
			reason: "test deduction",
			points: 10
		});

		expect(secondCall.deductions).toEqual([]);
	});
});
