import { hashPhoneNumber } from "../utils/hash";
import type { TelnyxCallEvent } from "./telnyxEvents";

export async function recordTelnyxWebhookEvent(
	db: D1Database,
	event: TelnyxCallEvent,
	plannedAction: string,
	plannedCommand: string,
	approvedAppIdentity: string | null = null
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
				planned_command,
				approved_app_identity
			)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		`)
		.bind(
			event.eventType,
			event.callControlId,
			event.callSessionId,
			callerHash,
			callerHash,
			event.to,
			plannedAction,
			plannedCommand,
			approvedAppIdentity
		)
		.run();
}


export interface TelnyxWebhookAuditRow {
	id: number;
	event_type: string;
	call_control_id: string | null;
	call_session_id: string | null;
	caller_hash: string | null;
	from_number_hash: string | null;
	to_number: string | null;
	planned_action: string | null;
	planned_command: string | null;
	approved_app_identity: string | null;
	created_at: string;
}

export async function listRecentTelnyxWebhookEvents(
	db: D1Database,
	limit = 25
): Promise<TelnyxWebhookAuditRow[]> {
	const safeLimit = Math.max(1, Math.min(limit, 100));

	const result = await db
		.prepare(`
			SELECT
				id,
				event_type,
				call_control_id,
				call_session_id,
				caller_hash,
				from_number_hash,
				to_number,
				planned_action,
				planned_command,
				approved_app_identity,
				created_at
			FROM telnyx_webhook_events
			ORDER BY id DESC
			LIMIT ?
		`)
		.bind(safeLimit)
		.all<TelnyxWebhookAuditRow>();

	return result.results;
}
