import { describe, expect, it } from "vitest";
import {
	completeBlock1
} from "../src/services/evidenceEngine";

describe("Evidence Engine Block 1", () => {
	it("places the Telnyx call information, call record, and billing timer into the Block 1 Evidence Box unchanged", () => {
		const callInformation = {
			from: "+18167186960",
			to: "+18005550993",
			direction: "incoming"
		};

		const callRecord = {
			callControlId: "call-control-id",
			callLegId: "call-leg-id",
			callSessionId: "call-session-id"
		};

		const billingTimer = {
			startedAt: "2026-07-18T18:00:00.000Z",
			disconnectBeforeSeconds: 60
		};

		const result = completeBlock1({
			callInformation,
			callRecord,
			billingTimer
		});

		expect(result).toEqual({
			callInformation,
			callRecord,
			billingTimer
		});

		expect(result.callInformation).toBe(callInformation);
		expect(result.callRecord).toBe(callRecord);
		expect(result.billingTimer).toBe(billingTimer);
	});

	it("does not evaluate, modify, supplement, or reject the received Telnyx information", () => {
		const result = completeBlock1({
			callInformation: null,
			callRecord: undefined,
			billingTimer: {
				rawValue: "received-from-telnyx"
			}
		});

		expect(result).toEqual({
			callInformation: null,
			callRecord: undefined,
			billingTimer: {
				rawValue: "received-from-telnyx"
			}
		});
	});
});
