export interface TelnyxCallEvent {
	eventType: string;
	callControlId: string;
	callSessionId: string;
	from: string;
	to: string;
	digits: string;
}

export function normalizeTelnyxEvent(payload: unknown): TelnyxCallEvent {
	const data = payload as {
		data?: {
			event_type?: string;
			payload?: {
				call_control_id?: string;
				call_session_id?: string;
				from?: string;
				to?: string;
				digits?: string;
				digit?: string;
				input?: string;
			};
		};
	};

	return {
		eventType: data.data?.event_type ?? "unknown",
		callControlId: data.data?.payload?.call_control_id ?? "",
		callSessionId: data.data?.payload?.call_session_id ?? "",
		from: data.data?.payload?.from ?? "",
		to: data.data?.payload?.to ?? "",
		digits: data.data?.payload?.digits
			?? data.data?.payload?.digit
			?? data.data?.payload?.input
			?? ""
	};
}


export function shouldScreenTelnyxEvent(event: TelnyxCallEvent): boolean {
	return event.eventType === "call.initiated";
}


export function shouldHandleTelnyxChallengeResponse(event: TelnyxCallEvent): boolean {
	return event.eventType === "call.gather.ended";
}
