import { screenPhoneNumber } from "./screening";
import { planTelnyxAction } from "./telnyxActions";
import { normalizeTelnyxEvent, shouldHandleTelnyxChallengeResponse, shouldScreenTelnyxEvent } from "./telnyxEvents";
import { planTelnyxCommand } from "./telnyxCommands";
import { recordTelnyxWebhookEvent } from "./telnyxAudit";
import { planChallengePrompt } from "./challengePrompts";
import { buildTelnyxRequest } from "./telnyxRequests";
import { executeTelnyxRequest } from "./telnyxExecutor";
import { planChallengeOutcome } from "./challengeOutcomes";
import { handleTelnyxChallengeResponse } from "./telnyxChallengeHandler";
import { saveTelnyxChallenge } from "./telnyxChallenges";
import { findUserByScreeningNumber } from "./users";
import { planApprovedCallDestination } from "./routing";

export async function handleTelnyxWebhook(
	payload: unknown,
	db: D1Database
): Promise<Response> {
	console.log("TELNYX WEBHOOK:", JSON.stringify(payload));

	const telnyxEvent = normalizeTelnyxEvent(payload);
	const callerNumber = telnyxEvent.from;

	if (shouldHandleTelnyxChallengeResponse(telnyxEvent)) {
		return handleTelnyxChallengeResponse(
			telnyxEvent,
			db
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
	const plannedTelnyxCommand = planTelnyxCommand(
		telnyxEvent,
		plannedTelnyxAction
	);
	const plannedChallengePrompt = planChallengePrompt(
		screening.challengeProfile
	);
	const plannedChallengeOutcome = planChallengeOutcome(
		plannedChallengePrompt
	);
	if (
		plannedTelnyxCommand.command === "gather" &&
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

	const simulatedTelnyxRequest = buildTelnyxRequest(
		plannedTelnyxCommand,
		plannedChallengePrompt,
		approvedDestination
	);
	const telnyxExecution = await executeTelnyxRequest(
		simulatedTelnyxRequest
	);

	await recordTelnyxWebhookEvent(
		db,
		telnyxEvent,
		plannedTelnyxAction.action,
		plannedTelnyxCommand.command
	);

	return Response.json({
		received: true,
		screened: true,
		callerNumber,
		protectedUser,
		telnyxEvent,
		screening,
		plannedTelnyxAction,
		plannedTelnyxCommand,
		plannedChallengePrompt,
		plannedChallengeOutcome,
		approvedDestination,
		simulatedTelnyxRequest,
		telnyxExecution
	});
}
