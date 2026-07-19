import {
	describe,
	expect,
	it,
	vi
} from "vitest";
import {
	completeBlock1,
	completeBlock2,
	completeBlock3
} from "../src/services/evidenceEngine";
import type {
	CallerResponseEvaluator,
	IpqsLookup
} from "../src/services/evidenceEngine";

function createBlock2EvidenceBox(
	deductions: Array<{
		finding: string;
		reason: string;
		points: number;
	}> = []
) {
	const block1EvidenceBox = completeBlock1({
		callInformation: {},
		callRecord: {},
		billingTimer: {}
	});

	return completeBlock2({
		block1EvidenceBox,
		screeningInformation: {
			callingNumberInformation: {},
			stirShakenInformation: {},
			cnamInformation: {},
			carrierLineLookupInformation: {}
		},
		deductions
	});
}

describe("Evidence Engine Block 3", () => {
	it("makes no caller-response deduction when either attempt supplies each required answer", async () => {
		const evaluator: CallerResponseEvaluator = {
			evaluate: vi
				.fn()
				.mockResolvedValueOnce({
					nameAccepted: true,
					reasonAccepted: false
				})
				.mockResolvedValueOnce({
					nameAccepted: false,
					reasonAccepted: true
				})
		};

		const result = await completeBlock3({
			block2EvidenceBox:
				createBlock2EvidenceBox(),
			prompt1: {
				audioRecordingReference: "audio-1",
				transcript: "This is Maria.",
				language: "en"
			},
			prompt2: {
				audioRecordingReference: "audio-2",
				transcript:
					"I am calling about tomorrow's appointment.",
				language: "en"
			},
			evaluator
		});

		expect(result.block3Deductions).toEqual([]);
		expect(result.finalStanding).toBe(100);
		expect(result.ipqsPerformed).toBe(false);
		expect(result).not.toHaveProperty(
			"routingInstruction"
		);
	});

	it("deducts fifteen points only when both name attempts fail", async () => {
		const evaluator: CallerResponseEvaluator = {
			evaluate: vi
				.fn()
				.mockResolvedValueOnce({
					nameAccepted: false,
					reasonAccepted: true
				})
				.mockResolvedValueOnce({
					nameAccepted: false,
					reasonAccepted: true
				})
		};

		const result = await completeBlock3({
			block2EvidenceBox:
				createBlock2EvidenceBox(),
			prompt1: {
				audioRecordingReference: "audio-1",
				transcript: "Calling about the bill.",
				language: "en"
			},
			prompt2: {
				audioRecordingReference: "audio-2",
				transcript:
					"It concerns the same bill.",
				language: "en"
			},
			evaluator,
			ipqsLookup: {
				lookup: vi.fn().mockResolvedValue({
					adverseFinding: false,
					finding: null,
					reason: null
				})
			}
		});

		expect(result.block3Deductions).toEqual([
			{
				finding:
					"Both name attempts failed",
				reason:
					"The caller did not provide an acceptable name in either response.",
				points: 15
			}
		]);

		expect(result.standingBeforeIpqs).toBe(85);
		expect(result.finalStanding).toBe(85);
		expect(result.ipqsPerformed).toBe(true);
		expect(result).not.toHaveProperty(
			"routingInstruction"
		);
	});

	it("deducts a maximum of thirty points when both name and reason fail twice", async () => {
		const evaluator: CallerResponseEvaluator = {
			evaluate: vi.fn()
		};

		const result = await completeBlock3({
			block2EvidenceBox:
				createBlock2EvidenceBox(),
			prompt1: {
				audioRecordingReference: null,
				transcript: "",
				language: null
			},
			prompt2: {
				audioRecordingReference: null,
				transcript: "   ",
				language: null
			},
			evaluator
		});

		expect(result.block3Deductions).toHaveLength(2);
		expect(result.finalStanding).toBe(70);
		expect(result.ipqsPerformed).toBe(false);
		expect(evaluator.evaluate).not.toHaveBeenCalled();
		expect(result).not.toHaveProperty(
			"routingInstruction"
		);
	});

	it("performs all math from Block 2, caller responses, and IPQS", async () => {
		const evaluator: CallerResponseEvaluator = {
			evaluate: vi.fn().mockResolvedValue({
				nameAccepted: true,
				reasonAccepted: true
			})
		};

		const ipqsLookup: IpqsLookup = {
			lookup: vi.fn().mockResolvedValue({
				adverseFinding: true,
				finding:
					"IPQS calling-number anomaly",
				reason:
					"IPQS reported an adverse finding for the calling number."
			})
		};

		const result = await completeBlock3({
			block2EvidenceBox:
				createBlock2EvidenceBox([
					{
						finding:
							"STIR/SHAKEN anomaly",
						reason:
							"Telnyx authentication information produced an approved deduction.",
						points: 5
					},
					{
						finding:
							"CNAM anomaly",
						reason:
							"Telnyx caller-name information produced an approved deduction.",
						points: 5
					},
					{
						finding:
							"Carrier information anomaly",
						reason:
							"Telnyx carrier information produced an approved deduction.",
						points: 5
					}
				]),
			prompt1: {
				audioRecordingReference: "audio-1",
				transcript:
					"Maria calling about an appointment.",
				language: "en"
			},
			prompt2: {
				audioRecordingReference: "audio-2",
				transcript:
					"Maria calling about tomorrow's appointment.",
				language: "en"
			},
			evaluator,
			ipqsLookup
		});

		expect(result.standingBeforeIpqs).toBe(85);
		expect(result.ipqsPerformed).toBe(true);
		expect(result.ipqsDeductions).toEqual([
			{
				finding:
					"IPQS calling-number anomaly",
				reason:
					"IPQS reported an adverse finding for the calling number.",
				points: 10
			}
		]);
		expect(result.finalStanding).toBe(75);
		expect(result).not.toHaveProperty(
			"routingInstruction"
		);
	});
});
