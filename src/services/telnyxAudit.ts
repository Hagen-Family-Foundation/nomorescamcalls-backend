import { hashPhoneNumber } from "../utils/hash";
import type { TelnyxCallEvent } from "./telnyxEvents";

export async function recordTelnyxWebhookEvent(
	db: D1Database,
	event: TelnyxCallEvent,
	plannedAction: string,
	plannedCommand: string
): Promise<void> {
	const callerHash = event.from
		? await hashPhoneNumber(event.from)
		: null;

	await db
		.prepare(`
			INSERT INTO telnyx_webhook_events (
				event_type,
				call_control_id,
				call_session_id,
				caller_hash,
				from_number_hash,
				to_number,
				planned_action,
				planned_command
			)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		`)
		.bind(
			event.eventType,
			event.callControlId,
			event.callSessionId,
			callerHash,
			callerHash,
			event.to,
			plannedAction,
			plannedCommand
		)
		.run();
}
