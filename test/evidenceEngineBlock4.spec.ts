import {
	describe,
	expect,
	it,
	vi
} from "vitest";
import {
	completeBlock4
} from "../src/services/evidenceEngine";
import type {
	Block3EvidenceBox,
	Block4EvidenceLibrary
} from "../src/services/evidenceEngine";

function createEvidenceBox(
	finalStanding: number
): Block3EvidenceBox {
	return {
		finalStanding
	} as Block3EvidenceBox;
}

function createEvidenceLibrary():
	Block4EvidenceLibrary {
	return {
		deliverEvidenceBox: vi.fn()
	};
}

describe("Evidence Engine Block 4", () => {
	it("delivers the completed Block 3 Evidence Box to the Evidence Library", async () => {
		const evidenceBox =
			createEvidenceBox(92);

		const evidenceLibrary =
			createEvidenceLibrary();

		const result = await completeBlock4({
			block3EvidenceBox: evidenceBox,
			evidenceLibrary,
			now: () =>
				"2026-07-18T19:00:00.000Z"
		});

		expect(
			evidenceLibrary.deliverEvidenceBox
		).toHaveBeenCalledOnce();

		expect(
			evidenceLibrary.deliverEvidenceBox
		).toHaveBeenCalledWith(evidenceBox);

		expect(result).toEqual({
			deliveryAttempted: true,
			deliveryTimestamp:
				"2026-07-18T19:00:00.000Z",
			deliveryCompleted: true,
			deliveryError: null
		});

		expect(evidenceBox.finalStanding).toBe(92);
	});

	it("records a delivery failure without changing the completed Evidence Box", async () => {
		const evidenceBox =
			createEvidenceBox(70);

		const evidenceLibrary =
			createEvidenceLibrary();

		vi.mocked(
			evidenceLibrary.deliverEvidenceBox
		).mockRejectedValue(
			new Error(
				"Evidence Library unavailable"
			)
		);

		const result = await completeBlock4({
			block3EvidenceBox: evidenceBox,
			evidenceLibrary,
			now: () =>
				"2026-07-18T19:05:00.000Z"
		});

		expect(
			evidenceLibrary.deliverEvidenceBox
		).toHaveBeenCalledWith(evidenceBox);

		expect(result).toEqual({
			deliveryAttempted: true,
			deliveryTimestamp:
				"2026-07-18T19:05:00.000Z",
			deliveryCompleted: false,
			deliveryError:
				"Evidence Library unavailable"
		});

		expect(evidenceBox.finalStanding).toBe(70);
	});
});
