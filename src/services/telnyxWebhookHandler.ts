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
	findProtectedLineByScreeningNumber
} from "./protectedLines";
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

export function buildFirstRequest(
	callerFacingBusinessName: string
): string {
	return `Thank you for calling ${callerFacingBusinessName}. Please say your name and reason for calling so that we may route your call appropriately. Thank you.`;
}

const FIRST_RESPONSE_SILENCE_SECONDS = 5;

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

	const resolvedProtectedLine =
		telnyxEvent.to
			? await findProtectedLineByScreeningNumber(
				db,
				telnyxEvent.to
			)
			: null;

	if (!resolvedProtectedLine) {
		return Response.json({
			received: true,
			screened: false,
			reason: "protected_line_unavailable"
		}, { status: 409 });
	}

	const { account, protectedLine } = resolvedProtectedLine;

	if (!protectedLine.callerFacingBusinessName) {
		return Response.json({
			received: true,
			screened: false,
			reason: "caller_facing_business_name_unavailable"
		}, { status: 409 });
	}

	const approvedDestination =
		planApprovedCallDestination(
			protectedLine
		);

	const callStartedAt =
		new Date().toISOString();
	const hasStirAttestation = Object.hasOwn(
		telnyxEvent,
		"shakenStirAttestation"
	);
	const hasStirValidation = Object.hasOwn(
		telnyxEvent,
		"shakenStirValidated"
	);
	const stirShakenInformation =
		hasStirAttestation || hasStirValidation
			? {
				...(hasStirAttestation
					? {
						attestation:
							telnyxEvent.shakenStirAttestation
					}
					: {}),
				...(hasStirValidation
					? {
						validated:
							telnyxEvent.shakenStirValidated
					}
					: {})
			}
			: undefined;
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
			stirShakenInformation,
			cnamInformation: null,
			carrierLineLookupInformation: null,
			...(Object.hasOwn(
				telnyxEvent,
				"callScreeningResult"
			)
				? {
					callScreeningResult:
						telnyxEvent.callScreeningResult
				}
				: {})
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
		id: account.id,
		protectedLineId: protectedLine.id,
		name: account
			? [
				account.firstName,
				account.lastName
			].filter(Boolean).join(" ") || null
			: null,
		callerFacingBusinessName:
			protectedLine.callerFacingBusinessName,
		phoneNumber: protectedLine.protectedPhoneNumber,
		screeningNumber:
			protectedLine.screeningNumber,
		sipUsername: protectedLine.sipUsername,
		carrier: protectedLine.carrier,
		accountStatus:
			account.accountStatus,
		coverageStatus:
			protectedLine.coverageStatus,
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
				prompt: buildFirstRequest(
					protectedLine.callerFacingBusinessName
				),
				timeoutSeconds:
					FIRST_RESPONSE_SILENCE_SECONDS
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
		protectedAccountId: account.id,
		protectedLine,
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
