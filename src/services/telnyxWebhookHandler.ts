import {
	normalizeTelnyxEvent,
	shouldScreenTelnyxEvent
} from "./telnyxEvents";
import {
	recordTelnyxWebhookEvent
} from "./telnyxAudit";
import {
	buildTelnyxRequest
} from "./telnyxRequests";
import {
	executeTelnyxRequest
} from "./telnyxExecutor";
import type {
	TelnyxApiConfig
} from "./telnyxExecutor";
import type {
	TelnyxPlannedCommand
} from "./telnyxCommands";
import {
	findUserByScreeningNumber
} from "./users";
import {
	planApprovedCallDestination
} from "./routing";
import type {
	TelnyxExecutionPolicy
} from "./telnyxExecutionPolicy";

const FIRST_REQUEST =
	"Please state your name and reason for calling.";

const FIRST_REQUEST_TIMEOUT_SECONDS = 10;

export async function handleTelnyxWebhook(
	payload: unknown,
	db: D1Database,
	executionPolicy: TelnyxExecutionPolicy,
	telnyxApiConfig: TelnyxApiConfig = {}
): Promise<Response> {
	console.log(
		"TELNYX WEBHOOK:",
		JSON.stringify(payload)
	);

	const telnyxEvent =
		normalizeTelnyxEvent(payload);

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
			reason:
				"event_type_not_processed",
			telnyxEvent
		});
	}

	if (
		!telnyxEvent.callControlId ||
		!telnyxEvent.callSessionId
	) {
		return Response.json(
			{
				received: true,
				screened: false,
				reason:
					"missing_call_identifiers",
				telnyxEvent
			},
			{
				status: 400
			}
		);
	}

	if (!telnyxEvent.from) {
		return Response.json(
			{
				received: true,
				screened: false,
				reason:
					"missing_caller_number",
				telnyxEvent
			},
			{
				status: 400
			}
		);
	}

	const protectedUser =
		telnyxEvent.to
			? await findUserByScreeningNumber(
				db,
				telnyxEvent.to
			)
			: null;

	const approvedDestination =
		planApprovedCallDestination(
			protectedUser
		);

	const answerCommand:
		TelnyxPlannedCommand = {
			mode: "simulated",
			command: "answer",
			callControlId:
				telnyxEvent.callControlId,
			callSessionId:
				telnyxEvent.callSessionId,
			reason:
				"Block 1 received the inbound call.",
			safetyNote:
				"Answer is guarded by TELNYX_LIVE_EXECUTION."
		};

	const firstRequestCommand:
		TelnyxPlannedCommand = {
			mode: "simulated",
			command: "gather",
			callControlId:
				telnyxEvent.callControlId,
			callSessionId:
				telnyxEvent.callSessionId,
			reason:
				"Block 3 begins the caller response process.",
			safetyNote:
				"Caller response collection is guarded by TELNYX_LIVE_EXECUTION."
		};

	const answerRequest =
		buildTelnyxRequest(
			answerCommand,
			null,
			approvedDestination
		);

	const firstRequest =
		buildTelnyxRequest(
			firstRequestCommand,
			{
				prompt: FIRST_REQUEST,
				timeoutSeconds:
					FIRST_REQUEST_TIMEOUT_SECONDS
			},
			approvedDestination
		);

	const answerExecution =
		await executeTelnyxRequest(
			answerRequest,
			executionPolicy,
			telnyxApiConfig
		);

	const firstRequestExecution =
		await executeTelnyxRequest(
			firstRequest,
			executionPolicy,
			telnyxApiConfig
		);

	await recordTelnyxWebhookEvent(
		db,
		telnyxEvent,
		"caller_response",
		firstRequestCommand.command,
		approvedDestination.destination
	);

	console.log(
		"TELNYX ANSWER REQUEST:",
		JSON.stringify(answerRequest)
	);

	console.log(
		"TELNYX FIRST REQUEST:",
		JSON.stringify(firstRequest)
	);

	console.log(
		"TELNYX ANSWER EXECUTION:",
		JSON.stringify(answerExecution)
	);

	console.log(
		"TELNYX FIRST REQUEST EXECUTION:",
		JSON.stringify(firstRequestExecution)
	);

	return Response.json({
		received: true,
		screened: true,
		callerNumber: telnyxEvent.from,
		protectedUser,
		telnyxEvent,
		approvedDestination,
		answerRequest,
		firstRequest,
		answerExecution,
		firstRequestExecution
	});
}
