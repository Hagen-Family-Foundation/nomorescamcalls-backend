export interface TelnyxCallEvent {
	eventType: string;
	callControlId: string;
	callSessionId: string;
	from: string;
	to: string;
	direction: string;
	flowDestination: string;
	clientState: string | null;
	transcription: TelnyxTranscriptionData | null;
	callScreeningResult?: unknown;
	shakenStirAttestation?: unknown;
	shakenStirValidated?: unknown;
}

export interface TelnyxTranscriptionData {
	transcript: string;
	isFinal: boolean;
	confidence: number | null;
}

export function normalizeTelnyxEvent(
	payload: unknown
): TelnyxCallEvent {
	const data = payload as {
		data?: {
			event_type?: string;
			payload?: {
				call_control_id?: string;
				call_session_id?: string;
				from?: string;
				to?: string;
				direction?: string;
				flow_destination?: string;
				client_state?: string;
				call_screening_result?: unknown;
				shaken_stir_attestation?: unknown;
				shaken_stir_validated?: unknown;
				transcription_data?: {
					transcript?: string;
					is_final?: boolean;
					confidence?: number;
				};
			};
		};
	};
	const source = data.data?.payload;

	return {
		eventType:
			data.data?.event_type ??
			"unknown",
		callControlId:
			data.data?.payload
				?.call_control_id ??
			"",
		callSessionId:
			data.data?.payload
				?.call_session_id ??
			"",
		from:
			data.data?.payload?.from ??
			"",
		to:
			data.data?.payload?.to ??
			"",
		direction:
			data.data?.payload
				?.direction ??
			"",
		flowDestination:
			data.data?.payload
				?.flow_destination ??
			"",
		clientState:
			data.data?.payload?.client_state ??
			null,
		transcription:
			source?.transcription_data
				? {
					transcript:
						source.transcription_data.transcript ?? "",
					isFinal:
						source.transcription_data.is_final === true,
					confidence:
						typeof source.transcription_data.confidence === "number"
							? source.transcription_data.confidence
							: null
				}
				: null,
		...(source && Object.hasOwn(
			source,
			"call_screening_result"
		)
			? {
				callScreeningResult:
					source.call_screening_result
			}
			: {}),
		...(source && Object.hasOwn(
			source,
			"shaken_stir_attestation"
		)
			? {
				shakenStirAttestation:
					source.shaken_stir_attestation
			}
			: {}),
		...(source && Object.hasOwn(
			source,
			"shaken_stir_validated"
		)
			? {
				shakenStirValidated:
					source.shaken_stir_validated
			}
			: {})
	};
}

export function shouldScreenTelnyxEvent(
	event: TelnyxCallEvent
): boolean {
	if (event.eventType !== "call.initiated") {
		return false;
	}

	if (
		event.direction === "outgoing"
		|| event.flowDestination ===
			"telnyx_sip_uri_cred_connection"
	) {
		return false;
	}

	return true;
}

export function isTelnyxTranscriptionEvent(
	event: TelnyxCallEvent
): boolean {
	return event.eventType ===
		"call.transcription";
}

export function isTelnyxSpeakEndedEvent(
	event: TelnyxCallEvent
): boolean {
	return event.eventType ===
		"call.speak.ended";
}
