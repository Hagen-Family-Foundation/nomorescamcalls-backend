import type { TelnyxPlannedCommand } from "./telnyxCommands";
import type { ChallengePromptPlan } from "./challengePrompts";
import type { ApprovedCallDestination } from "./routing";
import { planTelnyxAppDestination } from "./telnyxAppDestination";

export type TelnyxHttpMethod = "POST";

export interface SimulatedTelnyxRequest {
	mode: "simulated";
	method: TelnyxHttpMethod;
	endpoint: string;
	body: Record<string, unknown>;
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

	if (command.command === "bridge") {
		const telnyxAppDestination = planTelnyxAppDestination(
			approvedDestination
		);

		return {
			mode: "simulated",
			method: "POST",
			endpoint: `/calls/${command.callControlId}/actions/bridge`,
			body: {
				destinationType: telnyxAppDestination.destinationType,
				appIdentity: telnyxAppDestination.appIdentity,
				simulatedDestination: telnyxAppDestination.simulatedDestination,
				liveApiReady: telnyxAppDestination.liveApiReady,
				routingReason: telnyxAppDestination.reason
			},
			safetyNote: "Request is simulated only. No Telnyx bridge API call is sent."
		};
	}

	if (command.command === "hangup") {
		return {
			mode: "simulated",
			method: "POST",
			endpoint: `/calls/${command.callControlId}/actions/hangup`,
			body: {},
			safetyNote: "Request is simulated only. No Telnyx hangup API call is sent."
		};
	}

	if (command.command === "gather") {
		return {
			mode: "simulated",
			method: "POST",
			endpoint: `/calls/${command.callControlId}/actions/gather_using_speak`,
			body: {
				prompt: challengePrompt?.prompt ?? "Please press 5 to continue.",
				expectedInput: challengePrompt?.expectedInput ?? "5",
				maxAttempts: challengePrompt?.maxAttempts ?? 1,
				timeoutSeconds: challengePrompt?.timeoutSeconds ?? 5
			},
			safetyNote: "Request is simulated only. No Telnyx gather/speak API call is sent."
		};
	}

	return null;
}
