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
	Block4CallRouter,
	Block4EvidenceLibrary
} from "../src/services/evidenceEngine";

function createEvidenceBox(
	finalStanding: number
): Block3EvidenceBox {
	return {
		finalStanding
	} as Block3EvidenceBox;
}

function createCallRouter(): Block4CallRouter {
	return {
		connectSubscriber: vi.fn(),
		observeUntilUnavailableAndDisconnect:
			vi.fn(),
		playSystemErrorAndDisconnect:
			vi.fn()
	};
}

function createEvidenceLibrary():
	Block4EvidenceLibrary {
	return {
		routeEvidenceBox: vi.fn()
	};
}

describe("Evidence Engine Block 4", () => {
	it("connects a call with final standing from 86 through 100 and routes the Evidence Box", async () => {
		const evidenceBox =
			createEvidenceBox(92);
		const callRouter =
			createCallRouter();
		const evidenceLibrary =
			createEvidenceLibrary();

		const result = await completeBlock4({
			block3EvidenceBox: evidenceBox,
			callRouter,
			evidenceLibrary,
			now: () =>
				"2026-07-18T19:00:00.000Z"
		});

		expect(
			callRouter.connectSubscriber
		).toHaveBeenCalledWith(evidenceBox);

		expect(
			callRouter
				.observeUntilUnavailableAndDisconnect
		).not.toHaveBeenCalled();

		expect(
			evidenceLibrary.routeEvidenceBox
		).toHaveBeenCalledWith(evidenceBox);

		expect(result).toEqual({
			finalStanding: 92,
			callRoutingAction:
				"connect_subscriber",
			routingTimestamp:
				"2026-07-18T19:00:00.000Z",
			callRoutingCompleted: true,
			evidenceBoxRoutingCompleted: true,
			systemErrorHandled: false,
			callRoutingError: null,
			evidenceBoxRoutingError: null
		});

		expect(evidenceBox.finalStanding).toBe(92);
	});

	it("connects a call with final standing from 76 through 85 after Block 3 has completed IPQS", async () => {
		const evidenceBox =
			createEvidenceBox(76);
		const callRouter =
			createCallRouter();
		const evidenceLibrary =
			createEvidenceLibrary();

		const result = await completeBlock4({
			block3EvidenceBox: evidenceBox,
			callRouter,
			evidenceLibrary
		});

		expect(
			callRouter.connectSubscriber
		).toHaveBeenCalledWith(evidenceBox);

		expect(
			evidenceLibrary.routeEvidenceBox
		).toHaveBeenCalledWith(evidenceBox);

		expect(result.callRoutingAction).toBe(
			"connect_subscriber"
		);

		expect(result.finalStanding).toBe(76);
		expect(evidenceBox.finalStanding).toBe(76);
	});

	it("holds, plays the unavailable message, and disconnects a call with final standing from 0 through 75", async () => {
		const evidenceBox =
			createEvidenceBox(75);
		const callRouter =
			createCallRouter();
		const evidenceLibrary =
			createEvidenceLibrary();

		const result = await completeBlock4({
			block3EvidenceBox: evidenceBox,
			callRouter,
			evidenceLibrary
		});

		expect(
			callRouter
				.observeUntilUnavailableAndDisconnect
		).toHaveBeenCalledWith(evidenceBox);

		expect(
			callRouter.connectSubscriber
		).not.toHaveBeenCalled();

		expect(
			evidenceLibrary.routeEvidenceBox
		).toHaveBeenCalledWith(evidenceBox);

		expect(result.callRoutingAction).toBe(
			"observe_unavailable_disconnect"
		);

		expect(result.finalStanding).toBe(75);
		expect(evidenceBox.finalStanding).toBe(75);
	});

	it("plays the system error message, disconnects, and still routes the unchanged Evidence Box when call routing fails", async () => {
		const evidenceBox =
			createEvidenceBox(88);
		const callRouter =
			createCallRouter();
		const evidenceLibrary =
			createEvidenceLibrary();

		vi.mocked(
			callRouter.connectSubscriber
		).mockRejectedValue(
			new Error("Telnyx transfer failed")
		);

		const result = await completeBlock4({
			block3EvidenceBox: evidenceBox,
			callRouter,
			evidenceLibrary
		});

		expect(
			callRouter
				.playSystemErrorAndDisconnect
		).toHaveBeenCalledOnce();

		expect(
			evidenceLibrary.routeEvidenceBox
		).toHaveBeenCalledWith(evidenceBox);

		expect(result.callRoutingCompleted).toBe(
			false
		);

		expect(result.systemErrorHandled).toBe(
			true
		);

		expect(result.callRoutingError).toBe(
			"Telnyx transfer failed"
		);

		expect(
			result.evidenceBoxRoutingCompleted
		).toBe(true);

		expect(evidenceBox.finalStanding).toBe(88);
	});

	it("records an Evidence Library failure without changing the completed Evidence Box", async () => {
		const evidenceBox =
			createEvidenceBox(70);
		const callRouter =
			createCallRouter();
		const evidenceLibrary =
			createEvidenceLibrary();

		vi.mocked(
			evidenceLibrary.routeEvidenceBox
		).mockRejectedValue(
			new Error(
				"Evidence Library unavailable"
			)
		);

		const result = await completeBlock4({
			block3EvidenceBox: evidenceBox,
			callRouter,
			evidenceLibrary
		});

		expect(result.callRoutingCompleted).toBe(
			true
		);

		expect(
			result.evidenceBoxRoutingCompleted
		).toBe(false);

		expect(
			result.evidenceBoxRoutingError
		).toBe(
			"Evidence Library unavailable"
		);

		expect(evidenceBox.finalStanding).toBe(70);
	});
});
