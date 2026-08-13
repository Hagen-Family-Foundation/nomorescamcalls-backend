import type {
	TelnyxPlannedCommand
} from "./telnyxCommands";
import type {
	ApprovedCallDestination
} from "./routing";
import {
	planTelnyxAppDestination
} from "./telnyxAppDestination";

export type TelnyxHttpMethod = "POST";

export interface TelnyxSpeechRequest {
	prompt: string;
	timeoutSeconds: number;
	clientState?: string;
}

export interface TelnyxRequestMetadata {
	liveApiReady: boolean;
	command: TelnyxPlannedCommand["command"];
	destinationType?: string;
	sipUsername?: string | null;
	routingReason?: string;
	speechPrompt?: string;
	speechTimeoutSeconds?: number;
}

export interface SimulatedTelnyxRequest {
	mode: "simulated";
	method: TelnyxHttpMethod;
	endpoint: string;
	body: Record<string, unknown>;
	metadata: TelnyxRequestMetadata;
	safetyNote: string;
}

export function buildTelnyxRequest(
	command: TelnyxPlannedCommand,
	speechRequest: TelnyxSpeechRequest | null,
	approvedDestination:
		ApprovedCallDestination | null = null
): SimulatedTelnyxRequest | null {
	if (command.command === "noop") {
		return null;
	}

	if (command.command === "answer") {
		return {
			mode: "simulated",
			method: "POST",
			endpoint:
				`/calls/${command.callControlId}/actions/answer`,
			body: {},
			metadata: {
				liveApiReady: true,
				command: "answer"
			},
			safetyNote:
				"Answer is guarded by TELNYX_LIVE_EXECUTION."
		};
	}

	if (command.command === "record_start") {
		return {
			mode: "simulated",
			method: "POST",
			endpoint:
				`/calls/${command.callControlId}/actions/record_start`,
			body: {
				format: "mp3",
				channels: "single"
			},
			metadata: {
				liveApiReady: true,
				command: "record_start"
			},
			safetyNote:
				"Recording begins under Block 3 control."
		};
	}

	if (command.command === "transcription_start") {
		return {
			mode: "simulated",
			method: "POST",
			endpoint:
				`/calls/${command.callControlId}/actions/transcription_start`,
			body: {
				language: "en"
			},
			metadata: {
				liveApiReady: true,
				command: "transcription_start"
			},
			safetyNote:
				"Native Telnyx transcription supplies caller-response evidence to Block 3."
		};
	}

	if (command.command === "record_stop") {
		return {
			mode: "simulated",
			method: "POST",
			endpoint:
				`/calls/${command.callControlId}/actions/record_stop`,
			body: {},
			metadata: {
				liveApiReady: true,
				command: "record_stop"
			},
			safetyNote:
				"Recording ends when the call leaves NoMoreScamCalls control."
		};
	}

	if (command.command === "speak") {
		if (!speechRequest) {
			throw new Error(
				"Speech request is required for Telnyx speak."
			);
		}

		return {
			mode: "simulated",
			method: "POST",
			endpoint:
				`/calls/${command.callControlId}/actions/speak`,
			body: {
				payload: speechRequest.prompt,
				language: "en-US",
				voice: "female",
				...(speechRequest.clientState
					? {
						client_state:
							speechRequest.clientState
					}
					: {})
			},
			metadata: {
				liveApiReady: true,
				command: "speak",
				speechPrompt:
					speechRequest.prompt,
				speechTimeoutSeconds:
					speechRequest.timeoutSeconds
			},
			safetyNote:
				"Telnyx plays Block 3 call-control speech."
		};
	}

	if (command.command === "transfer") {
		const telnyxAppDestination =
			planTelnyxAppDestination(
				approvedDestination
			);

		return {
			mode: "simulated",
			method: "POST",
			endpoint:
				`/calls/${command.callControlId}/actions/transfer`,
			body: {
				to:
					`sip:${telnyxAppDestination.sipUsername}@sip.telnyx.com`,
				from:
					approvedDestination
						?.screeningNumber ?? "",
				from_display_name:
					"NoMoreScamCalls",
				timeout_secs: 60,
				media_encryption: "SRTP"
			},
			metadata: {
				liveApiReady:
					telnyxAppDestination
						.liveApiReady,
				command: "transfer",
				destinationType:
					telnyxAppDestination
						.destinationType,
				sipUsername:
					telnyxAppDestination
						.sipUsername,
				routingReason:
					telnyxAppDestination.reason
			},
			safetyNote:
				"Transfer uses the approved subscriber SIP destination and is guarded by TELNYX_LIVE_EXECUTION."
		};
	}

	if (command.command === "hangup") {
		return {
			mode: "simulated",
			method: "POST",
			endpoint:
				`/calls/${command.callControlId}/actions/hangup`,
			body: {},
			metadata: {
				liveApiReady: true,
				command: "hangup"
			},
			safetyNote:
				"Hangup is guarded by TELNYX_LIVE_EXECUTION."
		};
	}

	if (command.command === "gather") {
		if (!speechRequest) {
			throw new Error(
				"Speech request is required for caller-response collection."
			);
		}

		return {
			mode: "simulated",
			method: "POST",
			endpoint:
				`/calls/${command.callControlId}/actions/speak`,
			body: {
				payload: speechRequest.prompt,
				language: "en-US",
				voice: "female"
			},
			metadata: {
				liveApiReady: true,
				command: "gather",
				speechPrompt:
					speechRequest.prompt,
				speechTimeoutSeconds:
					speechRequest.timeoutSeconds
			},
			safetyNote:
				"Speech request plays the approved Block 3 caller request and is guarded by TELNYX_LIVE_EXECUTION."
		};
	}

	return null;
}
