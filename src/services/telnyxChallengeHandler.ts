import { planChallengeOutcome } from "./challengeOutcomes";
import { buildTelnyxRequest } from "./telnyxRequests";
import { executeTelnyxRequest } from "./telnyxExecutor";
import { recordTelnyxWebhookEvent } from "./telnyxAudit";
import type { TelnyxCallEvent } from "./telnyxEvents";
import type { TelnyxPlannedCommand } from "./telnyxCommands";
import type { ChallengePromptPlan } from "./challengePrompts";
import { getTelnyxChallenge, updateTelnyxChallengeStatus } from "./telnyxChallenges";
import { findUserById } from "./users";
import { planApprovedCallDestination } from "./routing";
import type { TelnyxExecutionPolicy } from "./telnyxExecutionPolicy";

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
	db: D1Database,
	executionPolicy: TelnyxExecutionPolicy
): Promise<Response> {
	const storedChallenge = await getTelnyxChallenge(
		db,
		event.callSessionId
	);

	const challengePrompt = storedChallenge
		? {
			...defaultChallengePrompt,
			expectedInput: storedChallenge.expectedInput
		}
		: defaultChallengePrompt;

	const plannedChallengeOutcome = planChallengeOutcome(
		challengePrompt,
		event.digits
	);

	await updateTelnyxChallengeStatus(
		db,
		event.callSessionId,
		plannedChallengeOutcome.outcome
	);

	const plannedTelnyxCommand: TelnyxPlannedCommand = {
		mode: "simulated",
		command: plannedChallengeOutcome.nextCommand,
		callControlId: event.callControlId,
		callSessionId: event.callSessionId,
		reason: plannedChallengeOutcome.reason,
		safetyNote: "Challenge response command is simulation-only and disabled."
	};

	const protectedUser = storedChallenge?.userId
		? await findUserById(
			db,
			storedChallenge.userId
		)
		: null;

	const approvedDestination = planApprovedCallDestination(
		protectedUser
	);

	const simulatedTelnyxRequest = buildTelnyxRequest(
		plannedTelnyxCommand,
		null,
		approvedDestination
	);

	const telnyxExecution = await executeTelnyxRequest(
		simulatedTelnyxRequest,
		executionPolicy
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
		protectedUser,
		approvedDestination,
		simulatedTelnyxRequest,
		telnyxExecution
	});
}
