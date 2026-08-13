import {
	describe,
	expect,
	it,
	vi
} from "vitest";
import {
	evaluateCallerResponse
} from "../src/services/evidenceEngine/responseExtraction";
import {
	normalizeTelnyxEvent
} from "../src/services/telnyxEvents";
import {
	extractTelnyxBlock3Transcript,
	matchesTelnyxCall
} from "../src/services/telnyxTranscription";

function transcriptionEvent(
	isFinal = true,
	transcript =
		"Kelly calling about the inspection."
) {
	return normalizeTelnyxEvent({
		data: {
			event_type:
				"call.transcription",
			payload: {
				call_control_id:
					"transcription-control-id",
				call_session_id:
					"transcription-session-id",
				transcription_data: {
					confidence: 0.95,
					is_final: isFinal,
					transcript
				}
			}
		}
	});
}

describe("Telnyx Block 3 transcription evidence", () => {
	it("correlates transcription using both Telnyx call identifiers", () => {
		const event = transcriptionEvent();

		expect(matchesTelnyxCall(event, {
			callControlId:
				"transcription-control-id",
			callSessionId:
				"transcription-session-id"
		})).toBe(true);

		expect(matchesTelnyxCall(event, {
			callControlId:
				"transcription-control-id",
			callSessionId:
				"another-session-id"
		})).toBe(false);
	});

	it("extracts final native transcript in the existing Block 3 prompt shape", async () => {
		const evidence =
			extractTelnyxBlock3Transcript(
				transcriptionEvent()
			);

		expect(evidence).toEqual({
			callControlId:
				"transcription-control-id",
			callSessionId:
				"transcription-session-id",
			promptEvidence: {
				audioRecordingReference: null,
				transcript:
					"Kelly calling about the inspection.",
				language: null
			},
			confidence: 0.95
		});

		const evaluate = vi.fn(async () => ({
			nameAccepted: true,
			reasonAccepted: true
		}));

		const result =
			await evaluateCallerResponse(
				evidence!.promptEvidence.transcript,
				evidence!.promptEvidence.language,
				{ evaluate }
			);

		expect(evaluate).toHaveBeenCalledWith({
			transcript:
				"Kelly calling about the inspection.",
			language: null
		});
		expect(result.nameAccepted).toBe(true);
		expect(result.reasonAccepted).toBe(true);
	});

	it("does not deliver interim or empty transcription as Block 3 evidence", () => {
		expect(
			extractTelnyxBlock3Transcript(
				transcriptionEvent(false)
			)
		).toBeNull();

		expect(
			extractTelnyxBlock3Transcript(
				transcriptionEvent(true, "   ")
			)
		).toBeNull();
	});
});
