export interface TelnyxCallEvent {
	eventType: string;
	callControlId: string;
	callSessionId: string;
	from: string;
	to: string;
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
			};
		};
	};

	return {
		eventType: data.data?.event_type ?? "unknown",
		callControlId: data.data?.payload?.call_control_id ?? "",
		callSessionId: data.data?.payload?.call_session_id ?? "",
		from: data.data?.payload?.from ?? "",
		to: data.data?.payload?.to ?? ""
	};
}


export function shouldScreenTelnyxEvent(event: TelnyxCallEvent): boolean {
	return event.eventType === "call.initiated";
}
