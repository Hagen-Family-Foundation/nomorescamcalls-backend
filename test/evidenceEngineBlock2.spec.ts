import { describe, expect, it } from "vitest";
import {
	completeBlock1,
	completeBlock2
} from "../src/services/evidenceEngine";

describe("Evidence Engine Block 2", () => {
	it("places the completed Block 1 Evidence Box, starting standing, Telnyx screening information, and deductions into the Block 2 Evidence Box", () => {
		const block1EvidenceBox = completeBlock1({
			callInformation: {
				callControlId: "call-control-id"
			},
			callRecord: {
				callSessionId: "call-session-id"
			},
			billingTimer: {
				startedAt: "2026-07-18T19:00:00.000Z"
			}
		});

		const result = completeBlock2({
			block1EvidenceBox,
			screeningInformation: {
				callingNumberInformation: {
					phoneNumber: "+18005551234"
				},
				stirShakenInformation: {
					attestation: "A"
				},
				cnamInformation: {
					name: "TEST CALLER"
				},
				carrierLineLookupInformation: {
					lineType: "mobile"
				},
				callScreeningResult: {
					action: "flag",
					reputation: "spam_likely"
				}
			}
		});

		expect(result).toEqual({
			block1EvidenceBox,
			startingStanding: 100,
			callingNumberInformation: {
				phoneNumber: "+18005551234"
			},
			stirShakenInformation: {
				attestation: "A"
			},
			cnamInformation: {
				name: "TEST CALLER"
			},
			carrierLineLookupInformation: {
				lineType: "mobile"
			},
			callScreeningResult: {
				action: "flag",
				reputation: "spam_likely"
			},
			deductions: []
		});
	});

	it("does not interpret, modify, supplement, or reject Telnyx screening information", () => {
		const block1EvidenceBox = completeBlock1({
			callInformation: {},
			callRecord: {},
			billingTimer: {}
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
			carrierLineLookupInformation: false,
			deductions: []
		});
		expect(result).not.toHaveProperty(
			"callScreeningResult"
		);
	});
});
