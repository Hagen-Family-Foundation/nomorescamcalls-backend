import type { TelnyxPlannedCommand } from "./telnyxCommands";
import type { ChallengePromptPlan } from "./challengePrompts";
import type { ApprovedCallDestination } from "./routing";
import { planTelnyxAppDestination } from "./telnyxAppDestination";

export type TelnyxHttpMethod = "POST";

export interface TelnyxRequestMetadata {
	liveApiReady: boolean;
	command: TelnyxPlannedCommand["command"];
	destinationType?: string;
	sipUsername?: string;
	routingReason?: string;
	challengeExpectedInput?: string;
	challengeMaxAttempts?: number;
	challengeTimeoutSeconds?: number;
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
	challengePrompt: ChallengePromptPlan | null,
	approvedDestination: ApprovedCallDestination | null = null
): SimulatedTelnyxRequest | null {
	if (command.command === "noop") {
		return null;
	}

	if (command.command === "answer") {
		return {
			mode: "simulated",
			method: "POST",
			endpoint: `/calls/${command.callControlId}/actions/answer`,
			body: {},
			metadata: {
				liveApiReady: true,
				command: "answer"
			},
			safetyNote: "Answer is guarded by TELNYX_LIVE_EXECUTION and remains disabled unless explicitly enabled."
		};
	}

	if (command.command === "transfer") {
		const telnyxAppDestination = planTelnyxAppDestination(
			approvedDestination
		);

		return {
			mode: "simulated",
			method: "POST",
			endpoint: `/calls/${command.callControlId}/actions/transfer`,
			body: {
				to: `sip:${telnyxAppDestination.sipUsername}@sip.telnyx.com`,
				from: approvedDestination?.screeningNumber ?? "",
				from_display_name: "NoMoreScamCalls",
				timeout_secs: 60,
				media_encryption: "SRTP"
			},
			metadata: {
				liveApiReady: telnyxAppDestination.liveApiReady,
				command: "transfer",
				destinationType: telnyxAppDestination.destinationType,
				sipUsername: telnyxAppDestination.sipUsername,
				routingReason: telnyxAppDestination.reason
			},
			safetyNote: "Transfer request uses Telnyx-confirmed WebRTC SIP URI format and is guarded by TELNYX_LIVE_EXECUTION."
		};
	}

	if (command.command === "hangup") {
		return {
			mode: "simulated",
			method: "POST",
			endpoint: `/calls/${command.callControlId}/actions/hangup`,
			body: {},
			metadata: {
				liveApiReady: true,
				command: "hangup"
			},
			safetyNote: "Hangup is guarded by TELNYX_LIVE_EXECUTION and remains disabled unless explicitly enabled."
		};
	}

	if (command.command === "gather") {
		const expectedInput = challengePrompt?.expectedInput ?? "5";
		const maxAttempts = challengePrompt?.maxAttempts ?? 1;
		const timeoutSeconds = challengePrompt?.timeoutSeconds ?? 5;

		return {
			mode: "simulated",
			method: "POST",
			endpoint: `/calls/${command.callControlId}/actions/gather_using_speak`,
			body: {
				payload: challengePrompt?.prompt ?? "Please state your name and reason for calling.",
				language: "en-US",
				voice: "female",
				valid_digits: expectedInput,
				max: 1,
				timeout_millis: timeoutSeconds * 1000,
				inter_digit_timeout_millis: 3000
			},
			metadata: {
				liveApiReady: true,
				command: "gather",
				challengeExpectedInput: expectedInput,
				challengeMaxAttempts: maxAttempts,
				challengeTimeoutSeconds: timeoutSeconds
			},
			safetyNote: "Gather using speak is guarded by TELNYX_LIVE_EXECUTION and remains disabled unless explicitly enabled."
		};
	}

	return null;
}
