import { planChallengeOutcome } from "./challengeOutcomes";
import { buildTelnyxRequest } from "./telnyxRequests";
import { executeTelnyxRequest } from "./telnyxExecutor";
import { recordTelnyxWebhookEvent } from "./telnyxAudit";
import type { TelnyxCallEvent } from "./telnyxEvents";
import type { TelnyxPlannedCommand } from "./telnyxCommands";
import type { ChallengePromptPlan } from "./challengePrompts";

const defaultChallengePrompt: ChallengePromptPlan = {
	mode: "simulated",
	type: "dtmf_press",
	prompt: "Please press 5 to continue.",
	profilePrompts: [],
	expectedInput: "5",
	maxAttempts: 1,
	timeoutSeconds: 5,
	costControlNote: "Default challenge response validation."
};

export async function handleTelnyxChallengeResponse(
	event: TelnyxCallEvent,
	db: D1Database
): Promise<Response> {
	const plannedChallengeOutcome = planChallengeOutcome(
		defaultChallengePrompt,
		event.digits
	);

	const plannedTelnyxCommand: TelnyxPlannedCommand = {
		mode: "simulated",
		command: plannedChallengeOutcome.nextCommand,
		callControlId: event.callControlId,
		callSessionId: event.callSessionId,
		reason: plannedChallengeOutcome.reason,
		safetyNote: "Challenge response command is simulation-only and disabled."
	};

	const simulatedTelnyxRequest = buildTelnyxRequest(
		plannedTelnyxCommand,
		null
	);

	const telnyxExecution = await executeTelnyxRequest(
		simulatedTelnyxRequest
	);

	await recordTelnyxWebhookEvent(
		db,
		event,
		"challenge_response",
		plannedTelnyxCommand.command
	);

	return Response.json({
		received: true,
		screened: false,
		challengeHandled: true,
		telnyxEvent: event,
		plannedChallengeOutcome,
		plannedTelnyxCommand,
		simulatedTelnyxRequest,
		telnyxExecution
	});
}
