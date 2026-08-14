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
	Block3CallController,
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

function createCallController():
	Block3CallController {
	return {
		startRecording: vi.fn(),
		connectSubscriber: vi.fn(),
		playUnavailableAndDisconnect:
			vi.fn(),
		playTechnicalDifficultiesAndDisconnect:
			vi.fn(),
		stopRecording: vi.fn()
	};
}

function createCleanIpqsLookup():
	IpqsLookup {
	return {
		lookup: vi.fn().mockResolvedValue({
			response: {},
			valid: true,
			active: true,
			recent_abuse: false,
			spammer: false
		})
	};
}

describe("Evidence Engine Block 3", () => {
	it("plays the approved technical-difficulties message when OpenAI evaluation fails", async () => {
		const evaluator: CallerResponseEvaluator = {
			evaluate: vi.fn().mockRejectedValue(
				new Error("OpenAI unavailable")
			)
		};
		const callController =
			createCallController();

		await expect(completeBlock3({
			block2EvidenceBox:
				createBlock2EvidenceBox(),
			prompt1: {
				audioRecordingReference: null,
				transcript: "This is Maria.",
				language: "en"
			},
			evaluator,
			callController
		})).rejects.toThrow("OpenAI unavailable");

		expect(
			callController
				.playTechnicalDifficultiesAndDisconnect
		).toHaveBeenCalledOnce();
		expect(
			callController.stopRecording
		).toHaveBeenCalledOnce();
	});

	it("releases immediately after a complete first response", async () => {
		const evaluator:
			CallerResponseEvaluator = {
				evaluate: vi.fn().mockResolvedValue({
					nameAccepted: true,
					reasonAccepted: true
				})
			};

		const callController =
			createCallController();

		const ipqsLookup =
			createCleanIpqsLookup();

		const result = await completeBlock3({
			block2EvidenceBox:
				createBlock2EvidenceBox(),
			prompt1: {
				audioRecordingReference:
					"recording-1",
				transcript:
					"Maria Lopez calling about tomorrow's appointment.",
				language: "en"
			},
			evaluator,
			ipqsLookup,
			callController
		});

		expect(
			evaluator.evaluate
		).toHaveBeenCalledOnce();

		expect(
			ipqsLookup.lookup
		).not.toHaveBeenCalled();

		expect(
			callController.connectSubscriber
		).toHaveBeenCalledOnce();

		expect(
			callController
				.playUnavailableAndDisconnect
		).not.toHaveBeenCalled();

		expect(result.prompt2).toBeNull();
		expect(result.ipqsPerformed).toBe(false);
		expect(result.finalStanding).toBe(100);
		expect(result.callResult).toBe(
			"connected"
		);
		expect(result.recordingCompleted).toBe(
			true
		);
	});

	it("starts IPQS after one failed first response and restores the full deduction after recovery", async () => {
		const evaluator:
			CallerResponseEvaluator = {
				evaluate: vi
					.fn()
					.mockResolvedValueOnce({
						nameAccepted: false,
						reasonAccepted: true
					})
					.mockResolvedValueOnce({
						nameAccepted: true,
						reasonAccepted: true
					})
			};

		const callController =
			createCallController();

		const ipqsLookup =
			createCleanIpqsLookup();

		const result = await completeBlock3({
			block2EvidenceBox:
				createBlock2EvidenceBox(),
			prompt1: {
				audioRecordingReference:
					"recording-1",
				transcript:
					"Calling about tomorrow's appointment.",
				language: "en"
			},
			prompt2: {
				audioRecordingReference:
					"recording-1",
				transcript:
					"Maria Lopez, calling about tomorrow's appointment.",
				language: "en"
			},
			evaluator,
			ipqsLookup,
			callController
		});

		expect(
			ipqsLookup.lookup
		).toHaveBeenCalledOnce();

		expect(
			result.standingAfterFirstResponse
		).toBe(85);

		expect(
			result.initialCallerResponseDeductions
		).toEqual([
			{
				source: "OpenAI",
				finding: "name",
				reason:
					"The caller did not provide an accepted name.",
				points: 15
			}
		]);

		expect(
			result.recoveredCallerResponseDeductions
		).toEqual([
			{
				source: "OpenAI",
				finding: "name",
				points: 15
			}
		]);

		expect(result.block3Deductions).toEqual(
			[]
		);

		expect(result.finalStanding).toBe(100);
		expect(result.callResult).toBe(
			"connected"
		);
	});

	it("performs IPQS at the inclusive 70-point lower boundary", async () => {
		const evaluator: CallerResponseEvaluator = {
			evaluate: vi.fn()
				.mockResolvedValueOnce({
					nameAccepted: false,
					reasonAccepted: false
				})
				.mockResolvedValueOnce({
					nameAccepted: true,
					reasonAccepted: false
				})
		};
		const ipqsLookup = createCleanIpqsLookup();
		const result = await completeBlock3({
			block2EvidenceBox: createBlock2EvidenceBox(),
			prompt1: {
				audioRecordingReference: null,
				transcript: "No usable response",
				language: "en"
			},
			prompt2: {
				audioRecordingReference: null,
				transcript: "Maria Lopez",
				language: "en"
			},
			evaluator,
			ipqsLookup,
			callController: createCallController()
		});

		expect(result.standingAfterFirstResponse).toBe(70);
		expect(result.ipqsPerformed).toBe(true);
		expect(ipqsLookup.lookup).toHaveBeenCalledOnce();
		expect(result.finalStanding).toBe(85);
	});

	it("applies five points for each approved negative IPQS field", async () => {
		const evaluator:
			CallerResponseEvaluator = {
				evaluate: vi
					.fn()
					.mockResolvedValueOnce({
						nameAccepted: false,
						reasonAccepted: true
					})
					.mockResolvedValueOnce({
						nameAccepted: true,
						reasonAccepted: true
					})
			};

		const ipqsLookup: IpqsLookup = {
			lookup: vi.fn().mockResolvedValue({
				response: {
					source: "IPQS"
				},
				valid: false,
				active: false,
				recent_abuse: true,
				spammer: true
			})
		};

		const result = await completeBlock3({
			block2EvidenceBox:
				createBlock2EvidenceBox(),
			prompt1: {
				audioRecordingReference:
					"recording-1",
				transcript:
					"Calling about an appointment.",
				language: "en"
			},
			prompt2: {
				audioRecordingReference:
					"recording-1",
				transcript:
					"Maria Lopez, calling about an appointment.",
				language: "en"
			},
			evaluator,
			ipqsLookup,
			callController:
				createCallController()
		});

		expect(result.ipqsDeductions).toEqual([
			{
				source: "IPQS",
				finding: "valid",
				reason:
					"IPQS returned valid = false.",
				points: 5
			},
			{
				source: "IPQS",
				finding: "active",
				reason:
					"IPQS returned active = false.",
				points: 5
			},
			{
				source: "IPQS",
				finding: "recent_abuse",
				reason:
					"IPQS returned recent_abuse = true.",
				points: 5
			},
			{
				source: "IPQS",
				finding: "spammer",
				reason:
					"IPQS returned spammer = true.",
				points: 5
			}
		]);

		expect(result.finalStanding).toBe(80);
		expect(result.callResult).toBe(
			"connected"
		);
	});

	it("diverts when caller-response and IPQS deductions leave the final standing at 75 or below", async () => {
		const evaluator:
			CallerResponseEvaluator = {
				evaluate: vi.fn().mockResolvedValue({
					nameAccepted: false,
					reasonAccepted: false
				})
			};

		const callController =
			createCallController();

		const ipqsLookup: IpqsLookup = {
			lookup: vi.fn().mockResolvedValue({
				response: {},
				valid: false,
				active: false,
				recent_abuse: true,
				spammer: true
			})
		};

		const result = await completeBlock3({
			block2EvidenceBox:
				createBlock2EvidenceBox(),
			prompt1: {
				audioRecordingReference:
					"recording-1",
				transcript: "",
				language: null
			},
			prompt2: {
				audioRecordingReference:
					"recording-1",
				transcript: "",
				language: null
			},
			evaluator,
			ipqsLookup,
			callController
		});

		expect(result.block3Deductions).toHaveLength(
			2
		);

		expect(result.ipqsDeductions).toHaveLength(
			4
		);

		expect(result.finalStanding).toBe(50);
		expect(result.callResult).toBe(
			"diverted"
		);

		expect(
			callController
				.playUnavailableAndDisconnect
		).toHaveBeenCalledOnce();

		expect(
			callController.connectSubscriber
		).not.toHaveBeenCalled();

		expect(
			callController.stopRecording
		).toHaveBeenCalledOnce();

		expect(result.recordingCompleted).toBe(
			true
		);
	});

	it("treats null IPQS fields as no deduction", async () => {
		const evaluator:
			CallerResponseEvaluator = {
				evaluate: vi
					.fn()
					.mockResolvedValueOnce({
						nameAccepted: true,
						reasonAccepted: false
					})
					.mockResolvedValueOnce({
						nameAccepted: true,
						reasonAccepted: true
					})
			};

		const ipqsLookup: IpqsLookup = {
			lookup: vi.fn().mockResolvedValue({
				response: {},
				valid: null,
				active: null,
				recent_abuse: null,
				spammer: null
			})
		};

		const result = await completeBlock3({
			block2EvidenceBox:
				createBlock2EvidenceBox(),
			prompt1: {
				audioRecordingReference:
					"recording-1",
				transcript:
					"Maria Lopez.",
				language: "en"
			},
			prompt2: {
				audioRecordingReference:
					"recording-1",
				transcript:
					"Maria Lopez, calling about the appointment.",
				language: "en"
			},
			evaluator,
			ipqsLookup,
			callController:
				createCallController()
		});

		expect(result.ipqsDeductions).toEqual([]);
		expect(result.finalStanding).toBe(100);
		expect(result.callResult).toBe(
			"connected"
		);
	});
});
