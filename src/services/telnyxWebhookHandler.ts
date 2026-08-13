import {
	isTelnyxTranscriptionEvent,
	isTelnyxSpeakEndedEvent,
	normalizeTelnyxEvent,
	shouldScreenTelnyxEvent
} from "./telnyxEvents";
import {
	extractTelnyxBlock3Transcript
} from "./telnyxTranscription";
import {
	completeBlock3UnavailablePlayback,
	deliverBlock3Transcription,
	initializeBlock3LiveSession,
	openBlock3ResponseWindow
} from "./block3LiveSessionClient";
import type {
	Block3LiveSessionNamespace
} from "./block3LiveSessionClient";
import {
	UNAVAILABLE_MESSAGE_CLIENT_STATE
} from "./block3LiveSession";
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
import {
	completeBlock1,
	completeBlock2
} from "./evidenceEngine";
import type {
	EvidenceLibraryCallInformation,
	EvidenceLibrarySubscriber
} from "./evidenceLibrary";

const FIRST_REQUEST =
	"State your name and reason for calling please.";

const FIRST_REQUEST_TIMEOUT_SECONDS = 10;

export async function handleTelnyxWebhook(
	payload: unknown,
	db: D1Database,
	executionPolicy: TelnyxExecutionPolicy,
	telnyxApiConfig: TelnyxApiConfig = {},
	block3LiveSessions?: Block3LiveSessionNamespace
): Promise<Response> {
	console.log(
		"TELNYX WEBHOOK:",
		JSON.stringify(payload)
	);

	const telnyxEvent =
		normalizeTelnyxEvent(payload);

	if (isTelnyxTranscriptionEvent(telnyxEvent)) {
		if (
			!telnyxEvent.callControlId
			|| !telnyxEvent.callSessionId
		) {
			return Response.json({
				received: true,
				screened: false,
				reason:
					"missing_call_identifiers",
				telnyxEvent
			}, { status: 400 });
		}

		const transcriptEvidence =
			extractTelnyxBlock3Transcript(
				telnyxEvent
			);

		await recordTelnyxWebhookEvent(
			db,
			telnyxEvent,
			"caller_response",
			"noop"
		);

		const liveSession = block3LiveSessions
			? await deliverBlock3Transcription(
				block3LiveSessions,
				telnyxEvent
			)
			: null;

		return Response.json({
			received: true,
			screened: false,
			transcriptionProcessed:
				transcriptEvidence !== null,
			reason: transcriptEvidence
				? "final_transcript_ready_for_block_3"
				: "transcript_not_final_or_usable",
			telnyxEvent,
			transcriptEvidence,
			liveSession
		});
	}

	if (isTelnyxSpeakEndedEvent(telnyxEvent)) {
		if (
			!telnyxEvent.callControlId
			|| !telnyxEvent.callSessionId
			|| !block3LiveSessions
		) {
			return Response.json({
				received: true,
				screened: false,
				reason:
					"block3_live_session_unavailable",
				telnyxEvent
			}, { status: 400 });
		}

		const unavailablePlayback =
			telnyxEvent.clientState ===
				UNAVAILABLE_MESSAGE_CLIENT_STATE;
		const liveSession = unavailablePlayback
			? await completeBlock3UnavailablePlayback(
				block3LiveSessions,
				telnyxEvent
			)
			: await openBlock3ResponseWindow(
				block3LiveSessions,
				telnyxEvent
			);

		await recordTelnyxWebhookEvent(
			db,
			telnyxEvent,
			"caller_response",
			"noop"
		);

		return Response.json({
			received: true,
			screened: false,
			reason: unavailablePlayback
				? "block3_unavailable_playback_processed"
				: "block3_response_window_opened",
			telnyxEvent,
			liveSession
		});
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

	const callStartedAt =
		new Date().toISOString();
	const block1EvidenceBox = completeBlock1({
		callInformation: {
			from: telnyxEvent.from,
			to: telnyxEvent.to
		},
		callRecord: {
			callControlId: telnyxEvent.callControlId,
			callSessionId: telnyxEvent.callSessionId
		},
		billingTimer: {
			startedAt: callStartedAt
		}
	});
	const block2EvidenceBox = completeBlock2({
		block1EvidenceBox,
		screeningInformation: {
			callingNumberInformation: {
				phoneNumber: telnyxEvent.from
			},
			stirShakenInformation: null,
			cnamInformation: null,
			carrierLineLookupInformation: null
		}
	});
	const callInformation:
		EvidenceLibraryCallInformation = {
			callSessionId: telnyxEvent.callSessionId,
			callControlId: telnyxEvent.callControlId,
			callStartedAt,
			callCompletedAt: null,
			callingNumber: telnyxEvent.from,
			cnam: null,
			carrier: null,
			lineType: null,
			stirShaken: null,
			country: null,
			state: null,
			county: null,
			city: null,
			zipCode: null,
			areaCode: null,
			geographicInformation: null,
			prompt1At: callStartedAt,
			prompt2At: null,
			connectionAt: null,
			diversionAt: null
		};
	const subscriber: EvidenceLibrarySubscriber = {
		id: protectedUser?.id ?? null,
		name: protectedUser
			? [
				protectedUser.firstName,
				protectedUser.lastName
			].filter(Boolean).join(" ") || null
			: null,
		phoneNumber: protectedUser?.phoneNumber ?? null,
		screeningNumber:
			protectedUser?.screeningNumber ?? null,
		sipUsername: protectedUser?.sipUsername ?? null,
		carrier: protectedUser?.carrier ?? null,
		accountStatus:
			protectedUser?.accountStatus ?? null,
		coverageStatus:
			protectedUser?.coverageStatus ?? null,
		country: null,
		state: null,
		county: null,
		city: null,
		zipCode: null,
		community: null
	};

	const liveSession = block3LiveSessions
		? await initializeBlock3LiveSession(
			block3LiveSessions,
			telnyxEvent,
			{
				block2EvidenceBox,
				callInformation,
				subscriber,
				approvedDestination
			}
		)
		: null;

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

	const transcriptionCommand:
		TelnyxPlannedCommand = {
			mode: "simulated",
			command: "transcription_start",
			callControlId:
				telnyxEvent.callControlId,
			callSessionId:
				telnyxEvent.callSessionId,
			reason:
				"Block 3 starts native transcription before requesting the caller response.",
			safetyNote:
				"Native transcription is guarded by TELNYX_LIVE_EXECUTION."
		};

	const recordingCommand:
		TelnyxPlannedCommand = {
			mode: "simulated",
			command: "record_start",
			callControlId:
				telnyxEvent.callControlId,
			callSessionId:
				telnyxEvent.callSessionId,
			reason:
				"Block 3 begins recording before the first caller request.",
			safetyNote:
				"Recording is guarded by TELNYX_LIVE_EXECUTION."
		};

	const firstRequestCommand:
		TelnyxPlannedCommand = {
			mode: "simulated",
			command: "speak",
			callControlId:
				telnyxEvent.callControlId,
			callSessionId:
				telnyxEvent.callSessionId,
			reason:
				"Block 3 plays the approved first caller request.",
			safetyNote:
				"Caller request playback is guarded by TELNYX_LIVE_EXECUTION."
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

	const transcriptionRequest =
		buildTelnyxRequest(
			transcriptionCommand,
			null,
			approvedDestination
		);

	const recordingRequest =
		buildTelnyxRequest(
			recordingCommand,
			null,
			approvedDestination
		);

	const answerExecution =
		await executeTelnyxRequest(
			answerRequest,
			executionPolicy,
			telnyxApiConfig
		);

	const recordingExecution =
		await executeTelnyxRequest(
			recordingRequest,
			executionPolicy,
			telnyxApiConfig
		);

	const transcriptionExecution =
		await executeTelnyxRequest(
			transcriptionRequest,
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
		transcriptionCommand.command,
		approvedDestination.destination
	);

	console.log(
		"TELNYX ANSWER REQUEST:",
		JSON.stringify(answerRequest)
	);

	console.log(
		"TELNYX TRANSCRIPTION REQUEST:",
		JSON.stringify(transcriptionRequest)
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
		"TELNYX TRANSCRIPTION EXECUTION:",
		JSON.stringify(transcriptionExecution)
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
		liveSession,
		telnyxEvent,
		approvedDestination,
		answerRequest,
		recordingRequest,
		transcriptionRequest,
		firstRequest,
		answerExecution,
		recordingExecution,
		transcriptionExecution,
		firstRequestExecution
	});
}
