import { describe, expect, it, vi } from "vitest";
import {
	completeBlock1,
	completeBlock2,
	completeBlock3,
	type CallerResponseEvaluator
} from "../src/services/evidenceEngine";

function createBlock2EvidenceBox() {
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
		}
	});
}

describe("Evidence Engine Block 3", () => {
	it("preserves two-prompt evidence and originates no deductions when both responses are usable", async () => {
		const evaluator: CallerResponseEvaluator = {
			evaluate: vi.fn().mockResolvedValue({
				nameAccepted: true,
				reasonAccepted: true
			})
		};

		const block2EvidenceBox =
			createBlock2EvidenceBox();

		const result = await completeBlock3({
			block2EvidenceBox,
			prompt1: {
				audioRecordingReference: "audio-1",
				transcript:
					"This is Maria calling about the appointment.",
				language: "en"
			},
			prompt2: {
				audioRecordingReference: "audio-2",
				transcript:
					"Maria, regarding tomorrow's appointment.",
				language: "en"
			},
			evaluator
		});

		expect(result.block2EvidenceBox).toBe(
			block2EvidenceBox
		);
		expect(result.prompt1.deductions).toEqual([]);
		expect(result.prompt2.deductions).toEqual([]);
		expect(result.deductions).toEqual([]);
		expect(result.totalBlock3Deductions).toBe(0);
		expect(result).not.toHaveProperty(
			"currentStanding"
		);
		expect(result).not.toHaveProperty("nextStep");
	});

	it("originates deductions independently for both prompts", async () => {
		const evaluator: CallerResponseEvaluator = {
			evaluate: vi
				.fn()
				.mockResolvedValueOnce({
					nameAccepted: false,
					reasonAccepted: true
				})
				.mockResolvedValueOnce({
					nameAccepted: false,
					reasonAccepted: false
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
				transcript: "Something.",
				language: "en"
			},
			evaluator
		});

		expect(result.prompt1.deductions).toEqual([
			{
				source: "caller_response",
				reason:
					"prompt_1_missing_or_unusable_name",
				points: 15
			}
		]);

		expect(result.prompt2.deductions).toEqual([
			{
				source: "caller_response",
				reason:
					"prompt_2_missing_or_unusable_name",
				points: 15
			},
			{
				source: "caller_response",
				reason:
					"prompt_2_missing_or_unusable_reason",
				points: 15
			}
		]);

		expect(result.totalBlock3Deductions).toBe(45);
	});

	it("originates the maximum sixty points when both transcripts are empty", async () => {
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

		expect(result.totalBlock3Deductions).toBe(60);
		expect(result.deductions).toHaveLength(4);
		expect(evaluator.evaluate).not.toHaveBeenCalled();
	});
});
