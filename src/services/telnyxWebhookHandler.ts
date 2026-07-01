import { screenPhoneNumber } from "./screening";
import { planTelnyxAction } from "./telnyxActions";
import { normalizeTelnyxEvent, shouldHandleTelnyxChallengeResponse, shouldScreenTelnyxEvent } from "./telnyxEvents";
import { planTelnyxExecution } from "./telnyxCommands";
import { recordTelnyxWebhookEvent } from "./telnyxAudit";
import { planChallengePrompt } from "./challengePrompts";
import { buildTelnyxRequest } from "./telnyxRequests";
import { executeTelnyxRequest } from "./telnyxExecutor";
import type { TelnyxApiConfig } from "./telnyxExecutor";
import { planChallengeOutcome } from "./challengeOutcomes";
import { handleTelnyxChallengeResponse } from "./telnyxChallengeHandler";
import { saveTelnyxChallenge } from "./telnyxChallenges";
import { findUserByScreeningNumber } from "./users";
import { planApprovedCallDestination } from "./routing";
import type { TelnyxExecutionPolicy } from "./telnyxExecutionPolicy";

export async function handleTelnyxWebhook(
	payload: unknown,
	db: D1Database,
	executionPolicy: TelnyxExecutionPolicy,
	telnyxApiConfig: TelnyxApiConfig = {}
): Promise<Response> {
	console.log("TELNYX WEBHOOK:", JSON.stringify(payload));

	const telnyxEvent = normalizeTelnyxEvent(payload);
	const callerNumber = telnyxEvent.from;

	if (shouldHandleTelnyxChallengeResponse(telnyxEvent)) {
		return handleTelnyxChallengeResponse(
			telnyxEvent,
			db,
			executionPolicy,
			telnyxApiConfig
		);
	}

	if (!shouldScreenTelnyxEvent(telnyxEvent)) {
		await recordTelnyxWebhookEvent(
			db,
			telnyxEvent,
			"none",
			"noop"
		);

		return Response.json({
			received: true,
			screened: false,
			reason: "event_type_not_screened",
			telnyxEvent
		});
	}

	if (!callerNumber) {
		return Response.json({
			received: true,
			screened: false,
			reason: "missing_caller_number"
		});
	}

	const protectedUser = telnyxEvent.to
		? await findUserByScreeningNumber(
			db,
			telnyxEvent.to
		)
		: null;

	const screening = await screenPhoneNumber(
		callerNumber,
		db,
		protectedUser?.id ?? null
	);

	const plannedTelnyxAction = planTelnyxAction(screening.action);
	const plannedTelnyxExecution = planTelnyxExecution(
		telnyxEvent,
		plannedTelnyxAction
	);
	const plannedTelnyxCommand = plannedTelnyxExecution.commands[0];
	const plannedChallengePrompt = planChallengePrompt(
		screening.challengeProfile
	);
	const plannedChallengeOutcome = planChallengeOutcome(
		plannedChallengePrompt
	);
	if (
		plannedTelnyxExecution.commands.some((command) => command.command === "gather") &&
		plannedChallengePrompt
	) {
		await saveTelnyxChallenge(
			db,
			telnyxEvent.callSessionId,
			telnyxEvent.callControlId,
			plannedChallengePrompt.expectedInput,
			protectedUser?.id ?? null
		);
	}

	const approvedDestination = planApprovedCallDestination(
		protectedUser
	);

	const telnyxRequests = plannedTelnyxExecution.commands.map((command) =>
		buildTelnyxRequest(
			command,
			plannedChallengePrompt,
			approvedDestination
		)
	);
	const telnyxExecutions = [];
	for (const request of telnyxRequests) {
		telnyxExecutions.push(await executeTelnyxRequest(
			request,
			executionPolicy,
			telnyxApiConfig
		));
	}
	const simulatedTelnyxRequest = telnyxRequests[0] ?? null;
	const telnyxExecution = telnyxExecutions[0] ?? null;


	console.log("SCREENING:", JSON.stringify(screening));
	console.log("PLANNED ACTION:", JSON.stringify(plannedTelnyxAction));
	console.log("PLANNED EXECUTION:", JSON.stringify(plannedTelnyxExecution));
	console.log("PLANNED COMMAND:", JSON.stringify(plannedTelnyxCommand));
	console.log("TELNYX REQUESTS:", JSON.stringify(telnyxRequests));
	console.log("TELNYX EXECUTIONS:", JSON.stringify(telnyxExecutions));

	await recordTelnyxWebhookEvent(
		db,
		telnyxEvent,
		plannedTelnyxAction.action,
		plannedTelnyxCommand.command,
		approvedDestination.destination
	);

	return Response.json({
		received: true,
		screened: true,
		callerNumber,
		protectedUser,
		telnyxEvent,
		screening,
		plannedTelnyxAction,
		plannedTelnyxExecution,
		plannedTelnyxCommand,
		plannedChallengePrompt,
		plannedChallengeOutcome,
		approvedDestination,
		simulatedTelnyxRequest,
		telnyxExecution,
		telnyxRequests,
		telnyxExecutions
	});
}
