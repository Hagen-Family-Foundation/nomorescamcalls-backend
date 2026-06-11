import { screenPhoneNumber } from "./screening";
import { planTelnyxAction } from "./telnyxActions";
import { normalizeTelnyxEvent, shouldScreenTelnyxEvent } from "./telnyxEvents";
import { planTelnyxCommand } from "./telnyxCommands";
import { recordTelnyxWebhookEvent } from "./telnyxAudit";
import { planChallengePrompt } from "./challengePrompts";
import { buildTelnyxRequest } from "./telnyxRequests";
import { executeTelnyxRequest } from "./telnyxExecutor";

export async function handleTelnyxWebhook(
	payload: unknown,
	db: D1Database
): Promise<Response> {
	console.log("TELNYX WEBHOOK:", JSON.stringify(payload));

	const telnyxEvent = normalizeTelnyxEvent(payload);
	const callerNumber = telnyxEvent.from;

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

	const screening = await screenPhoneNumber(
		callerNumber,
		db
	);

	const plannedTelnyxAction = planTelnyxAction(screening.action);
	const plannedTelnyxCommand = planTelnyxCommand(
		telnyxEvent,
		plannedTelnyxAction
	);
	const plannedChallengePrompt = planChallengePrompt(
		screening.challengeProfile
	);
	const simulatedTelnyxRequest = buildTelnyxRequest(
		plannedTelnyxCommand,
		plannedChallengePrompt
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
		telnyxEvent,
		screening,
		plannedTelnyxAction,
		plannedTelnyxCommand,
		plannedChallengePrompt,
		simulatedTelnyxRequest,
		telnyxExecution
	});
}
