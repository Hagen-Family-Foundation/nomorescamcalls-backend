import { describe, expect, it } from "vitest";
import {
	completeBlock1,
	completeBlock2
} from "../src/services/evidenceEngine";

describe("Evidence Engine Block 2", () => {
	it("places the completed Block 1 Evidence Box, starting standing, and Telnyx screening information into the Block 2 Evidence Box", () => {
		const block1EvidenceBox = completeBlock1({
			callInformation: {
				from: "+18167186960",
				to: "+19139562493"
			},
			callRecord: {
				callSessionId: "call-session-id"
			},
			billingTimer: {
				startedAt: "2026-07-18T18:00:00.000Z"
			}
		});

		const callingNumberInformation = {
			number: "+18167186960"
		};

		const stirShakenInformation = {
			attestation: "A"
		};

		const cnamInformation = {
			name: "TEST CALLER"
		};

		const carrierLineLookupInformation = {
			carrier: "Test Carrier",
			lineType: "mobile"
		};

		const result = completeBlock2({
			block1EvidenceBox,
			screeningInformation: {
				callingNumberInformation,
				stirShakenInformation,
				cnamInformation,
				carrierLineLookupInformation
			}
		});

		expect(result).toEqual({
			block1EvidenceBox,
			startingStanding: 100,
			callingNumberInformation,
			stirShakenInformation,
			cnamInformation,
			carrierLineLookupInformation
		});

		expect(result.block1EvidenceBox).toBe(block1EvidenceBox);
		expect(result.callingNumberInformation).toBe(
			callingNumberInformation
		);
		expect(result.stirShakenInformation).toBe(
			stirShakenInformation
		);
		expect(result.cnamInformation).toBe(cnamInformation);
		expect(result.carrierLineLookupInformation).toBe(
			carrierLineLookupInformation
		);
	});

	it("does not interpret, modify, supplement, or reject Telnyx screening information", () => {
		const block1EvidenceBox = completeBlock1({
			callInformation: null,
			callRecord: null,
			billingTimer: null
		});

		const result = completeBlock2({
			block1EvidenceBox,
			screeningInformation: {
				callingNumberInformation: null,
				stirShakenInformation: undefined,
				cnamInformation: {
					raw: "received"
				},
				carrierLineLookupInformation: false
			}
		});

		expect(result).toEqual({
			block1EvidenceBox,
			startingStanding: 100,
			callingNumberInformation: null,
			stirShakenInformation: undefined,
			cnamInformation: {
				raw: "received"
			},
			carrierLineLookupInformation: false
		});
	});
});
