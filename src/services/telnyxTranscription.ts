import type {
	Block3PromptEvidence
} from "./evidenceEngine/block3";
import type {
	TelnyxCallEvent
} from "./telnyxEvents";

export interface TelnyxCallCorrelation {
	callControlId: string;
	callSessionId: string;
}

export interface TelnyxBlock3TranscriptEvidence
	extends TelnyxCallCorrelation {
	promptEvidence: Block3PromptEvidence;
	confidence: number | null;
}

export function matchesTelnyxCall(
	event: TelnyxCallEvent,
	call: TelnyxCallCorrelation
): boolean {
	return event.callControlId ===
		call.callControlId
		&& event.callSessionId ===
			call.callSessionId;
}

export function extractTelnyxBlock3Transcript(
	event: TelnyxCallEvent
): TelnyxBlock3TranscriptEvidence | null {
	if (
		event.eventType !== "call.transcription"
		|| !event.callControlId
		|| !event.callSessionId
		|| !event.transcription?.isFinal
		|| event.transcription.transcript.trim() === ""
	) {
		return null;
	}

	return {
		callControlId: event.callControlId,
		callSessionId: event.callSessionId,
		promptEvidence: {
			audioRecordingReference: null,
			transcript:
				event.transcription.transcript,
			language: null
		},
		confidence:
			event.transcription.confidence
	};
}
