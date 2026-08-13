export interface TelnyxCallEvent {
	eventType: string;
	callControlId: string;
	callSessionId: string;
	from: string;
	to: string;
	direction: string;
	flowDestination: string;
	transcription: TelnyxTranscriptionData | null;
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
				transcription_data?: {
					transcript?: string;
					is_final?: boolean;
					confidence?: number;
				};
			};
		};
	};

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
		transcription:
			data.data?.payload
				?.transcription_data
				? {
					transcript:
						data.data.payload.transcription_data.transcript ?? "",
					isFinal:
						data.data.payload.transcription_data.is_final === true,
					confidence:
						typeof data.data.payload.transcription_data.confidence === "number"
							? data.data.payload.transcription_data.confidence
							: null
				}
				: null
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
