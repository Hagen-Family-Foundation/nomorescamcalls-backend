import { describe, expect, it, vi } from "vitest";
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
	return completeBlock2({
		block1EvidenceBox: completeBlock1({
			callInformation: {},
			callRecord: {},
			billingTimer: {}
		}),
		screeningInformation: {
			callingNumberInformation: {},
			stirShakenInformation: {},
			cnamInformation: {},
			carrierLineLookupInformation: {}
		},
		deductions
	});
}

function createCallController(): Block3CallController {
	return {
		startRecording: vi.fn(),
		connectSubscriber: vi.fn(),
		playUnavailableAndDisconnect: vi.fn(),
		playTechnicalDifficultiesAndDisconnect: vi.fn(),
		stopRecording: vi.fn()
	};
}

function cleanIpqsResult() {
	return {
		response: {},
		valid: true,
		active: true,
		recent_abuse: false,
		spammer: false
	};
}

function createCleanIpqsLookup(): IpqsLookup {
	return {
		lookup: vi.fn().mockResolvedValue(cleanIpqsResult())
	};
}

function evaluatorFor(
	prompt1: readonly [boolean, boolean],
	prompt2?: readonly [boolean, boolean]
): CallerResponseEvaluator {
	const evaluate = vi.fn().mockResolvedValueOnce({
		nameAccepted: prompt1[0],
		reasonAccepted: prompt1[1]
	});

	if (prompt2) {
		evaluate.mockResolvedValueOnce({
			nameAccepted: prompt2[0],
			reasonAccepted: prompt2[1]
		});
	}

	return { evaluate };
}

const livePrompt2Cases = [
	{
		label: "P1 name fail; P2 complete",
		prompt1: [false, true], prompt2: [true, true],
		standing: 100, activePoints: [], crossed: false
	},
	{
		label: "name fails both prompts",
		prompt1: [false, true], prompt2: [false, true],
		standing: 82, activePoints: [8, 10], crossed: false
	},
	{
		label: "P1 name fail and P2 reason fail",
		prompt1: [false, true], prompt2: [true, false],
		standing: 80, activePoints: [15, 5], crossed: true
	},
	{
		label: "P1 name fail and P2 both fail",
		prompt1: [false, true], prompt2: [false, false],
		standing: 67, activePoints: [8, 10, 15], crossed: false
	},
	{
		label: "P1 reason fail; P2 complete",
		prompt1: [true, false], prompt2: [true, true],
		standing: 100, activePoints: [], crossed: false
	},
	{
		label: "P1 reason fail and P2 name fail",
		prompt1: [true, false], prompt2: [false, true],
		standing: 85, activePoints: [10, 5], crossed: true
	},
	{
		label: "reason fails both prompts",
		prompt1: [true, false], prompt2: [true, false],
		standing: 73, activePoints: [12, 15], crossed: false
	},
	{
		label: "P1 reason fail and P2 both fail",
		prompt1: [true, false], prompt2: [false, false],
		standing: 63, activePoints: [12, 10, 15], crossed: false
	},
	{
		label: "P1 both fail; P2 complete",
		prompt1: [false, false], prompt2: [true, true],
		standing: 100, activePoints: [], crossed: false
	},
	{
		label: "P1 both fail; P2 name fail",
		prompt1: [false, false], prompt2: [false, true],
		standing: 82, activePoints: [8, 10], crossed: false
	},
	{
		label: "P1 both fail; P2 reason fail",
		prompt1: [false, false], prompt2: [true, false],
		standing: 73, activePoints: [12, 15], crossed: false
	},
	{
		label: "both fields fail both prompts",
		prompt1: [false, false], prompt2: [false, false],
		standing: 55, activePoints: [8, 12, 10, 15], crossed: false
	}
] as const;

function promptEvidence(label: string) {
	return {
		audioRecordingReference: null,
		transcript: label,
		language: "en"
	};
}

describe("Evidence Engine Block 3", () => {
	it("plays the approved technical-difficulties message when OpenAI evaluation fails", async () => {
		const evaluator: CallerResponseEvaluator = {
			evaluate: vi.fn().mockRejectedValue(
				new Error("OpenAI unavailable")
			)
		};
		const callController = createCallController();

		await expect(completeBlock3({
			block2EvidenceBox: createBlock2EvidenceBox(),
			prompt1: promptEvidence("This is Maria."),
			evaluator,
			callController
		})).rejects.toThrow("OpenAI unavailable");

		expect(
			callController.playTechnicalDifficultiesAndDisconnect
		).toHaveBeenCalledOnce();
		expect(callController.stopRecording).toHaveBeenCalledOnce();
	});

	it("releases a complete Prompt 1 at 100 without Prompt 2 or IPQS", async () => {
		const evaluator = evaluatorFor([true, true]);
		const callController = createCallController();
		const ipqsLookup = createCleanIpqsLookup();
		const result = await completeBlock3({
			block2EvidenceBox: createBlock2EvidenceBox(),
			prompt1: promptEvidence(
				"Maria Lopez calling about tomorrow's appointment."
			),
			evaluator,
			ipqsLookup,
			callController
		});

		expect(evaluator.evaluate).toHaveBeenCalledOnce();
		expect(ipqsLookup.lookup).not.toHaveBeenCalled();
		expect(result.prompt2).toBeNull();
		expect(result.ipqsPerformed).toBe(false);
		expect(result.finalStanding).toBe(100);
		expect(result.callResult).toBe("connected");
		expect(callController.connectSubscriber).toHaveBeenCalledOnce();
		expect(
			callController.playUnavailableAndDisconnect
		).not.toHaveBeenCalled();
		expect(result.recordingCompleted).toBe(true);
	});

	it.each(livePrompt2Cases)(
		"produces the approved standing for $label",
		async ({ prompt1, prompt2, standing, activePoints, crossed }) => {
			const evaluator = evaluatorFor(prompt1, prompt2);
			const ipqsLookup = createCleanIpqsLookup();
			const result = await completeBlock3({
				block2EvidenceBox: createBlock2EvidenceBox(),
				prompt1: promptEvidence("Prompt 1 response"),
				prompt2: promptEvidence("Prompt 2 response"),
				evaluator,
				ipqsLookup,
				callController: createCallController()
			});

			expect(result.finalStanding).toBe(standing);
			expect(result.block3Deductions.map(
				(deduction) => deduction.points
			)).toEqual(activePoints);
			expect(result.block3Deductions.filter(
				(deduction) =>
					deduction.finding === "complete_response"
			)).toHaveLength(crossed ? 1 : 0);
			const ipqsExpected = standing >= 76 && standing <= 85;
			expect(result.ipqsPerformed).toBe(ipqsExpected);
			expect(ipqsLookup.lookup).toHaveBeenCalledTimes(
				ipqsExpected ? 1 : 0
			);
		}
	);

	it("records redemption and skips IPQS when Prompt 2 resolves the response", async () => {
		const evaluator = evaluatorFor([false, true], [true, true]);
		const ipqsLookup = createCleanIpqsLookup();
		const result = await completeBlock3({
			block2EvidenceBox: createBlock2EvidenceBox(),
			prompt1: promptEvidence("Calling about an appointment."),
			prompt2: promptEvidence(
				"Maria calling about an appointment."
			),
			evaluator,
			ipqsLookup,
			callController: createCallController()
		});

		expect(result.standingAfterFirstResponse).toBe(92);
		expect(result.initialCallerResponseDeductions).toEqual([{
			source: "OpenAI",
			finding: "name",
			reason: "The caller did not provide an accepted name.",
			points: 8
		}]);
		expect(result.recoveredCallerResponseDeductions).toEqual([{
			source: "OpenAI",
			finding: "name",
			points: 8
		}]);
		expect(result.block3Deductions).toEqual([]);
		expect(ipqsLookup.lookup).not.toHaveBeenCalled();
		expect(result.finalStanding).toBe(100);
	});

	it("performs IPQS at the inclusive 76-point lower boundary after Prompt 2", async () => {
		const evaluator = evaluatorFor([false, true], [true, false]);
		const ipqsLookup = createCleanIpqsLookup();
		const result = await completeBlock3({
			block2EvidenceBox: createBlock2EvidenceBox([{
				finding: "block2-test",
				reason: "Boundary test deduction.",
				points: 4
			}]),
			prompt1: promptEvidence("Prompt 1 response"),
			prompt2: promptEvidence("Prompt 2 response"),
			evaluator,
			ipqsLookup,
			callController: createCallController()
		});

		expect(result.standingAfterFirstResponse).toBe(88);
		expect(result.ipqsPerformed).toBe(true);
		expect(ipqsLookup.lookup).toHaveBeenCalledOnce();
		expect(result.finalStanding).toBe(76);
	});

	it("invokes IPQS only after both prompt evaluations complete", async () => {
		const evaluator = evaluatorFor([false, true], [false, true]);
		const ipqsLookup: IpqsLookup = {
			lookup: vi.fn(async () => {
				expect(evaluator.evaluate).toHaveBeenCalledTimes(2);
				return cleanIpqsResult();
			})
		};

		await completeBlock3({
			block2EvidenceBox: createBlock2EvidenceBox(),
			prompt1: promptEvidence("Prompt 1 response"),
			prompt2: promptEvidence("Prompt 2 response"),
			evaluator,
			ipqsLookup,
			callController: createCallController()
		});

		expect(ipqsLookup.lookup).toHaveBeenCalledOnce();
	});

	it("applies only the approved IPQS field deductions", async () => {
		const evaluator = evaluatorFor([false, true], [true, false]);
		const ipqsLookup: IpqsLookup = {
			lookup: vi.fn().mockResolvedValue({
				response: { fraud_score: 99 },
				valid: false,
				active: false,
				recent_abuse: true,
				spammer: true
			})
		};
		const result = await completeBlock3({
			block2EvidenceBox: createBlock2EvidenceBox(),
			prompt1: promptEvidence("Prompt 1 response"),
			prompt2: promptEvidence("Prompt 2 response"),
			evaluator,
			ipqsLookup,
			callController: createCallController()
		});

		expect(result.ipqsDeductions.map(
			(deduction) => deduction.points
		)).toEqual([5, 5, 5, 5]);
		expect(result.finalStanding).toBe(60);
		expect(result.callResult).toBe("diverted");
	});

	it("diverts at 75 or below without invoking IPQS", async () => {
		const evaluator = evaluatorFor([false, false], [false, false]);
		const callController = createCallController();
		const ipqsLookup = createCleanIpqsLookup();
		const result = await completeBlock3({
			block2EvidenceBox: createBlock2EvidenceBox(),
			prompt1: promptEvidence("Prompt 1 response"),
			prompt2: promptEvidence("Prompt 2 response"),
			evaluator,
			ipqsLookup,
			callController
		});

		expect(result.block3Deductions.map(
			(deduction) => deduction.points
		)).toEqual([8, 12, 10, 15]);
		expect(ipqsLookup.lookup).not.toHaveBeenCalled();
		expect(result.ipqsDeductions).toEqual([]);
		expect(result.finalStanding).toBe(55);
		expect(result.callResult).toBe("diverted");
		expect(
			callController.playUnavailableAndDisconnect
		).toHaveBeenCalledOnce();
		expect(callController.connectSubscriber).not.toHaveBeenCalled();
		expect(callController.stopRecording).toHaveBeenCalledOnce();
		expect(result.recordingCompleted).toBe(true);
	});

	it("treats null IPQS fields as no deduction", async () => {
		const evaluator = evaluatorFor([true, false], [false, true]);
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
			block2EvidenceBox: createBlock2EvidenceBox(),
			prompt1: promptEvidence("Prompt 1 response"),
			prompt2: promptEvidence("Prompt 2 response"),
			evaluator,
			ipqsLookup,
			callController: createCallController()
		});

		expect(result.ipqsDeductions).toEqual([]);
		expect(result.finalStanding).toBe(85);
		expect(result.callResult).toBe("connected");
	});
});
