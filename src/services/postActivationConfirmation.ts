import { postTelnyxJson, type TelnyxHttpClientConfig } from "./telnyxHttpClient";
import {
	findProtectedLineById,
	type ActivationConfirmationCallStatus
} from "./protectedLines";
import { findUserById } from "./users";

export const POST_ACTIVATION_CONFIRMATION_MESSAGE =
	"Your NoMoreScamCalls setup is complete and your protection is now active. Thank you.";

const CLIENT_STATE_TYPE = "nmsc_post_activation_confirmation";

export interface PostActivationConfirmationConfig extends TelnyxHttpClientConfig {
	liveExecution?: string;
	callControlApplicationId?: string;
}

export interface PostActivationConfirmationResult {
	status: ActivationConfirmationCallStatus;
	initiatedAt: string | null;
	completedAt: string | null;
}

interface ConfirmationWebhookEvent {
	eventType: string;
	callControlId: string;
	clientState: string;
	protectedLineId: number;
}

function confirmationClientState(protectedLineId: number): string {
	return btoa(JSON.stringify({
		type: CLIENT_STATE_TYPE,
		protectedLineId
	}));
}

function parseConfirmationWebhook(payload: unknown): ConfirmationWebhookEvent | null {
	if (!payload || typeof payload !== "object") {
		return null;
	}

	const data = (payload as {
		data?: {
			event_type?: unknown;
			payload?: {
				call_control_id?: unknown;
				client_state?: unknown;
			};
		};
	}).data;
	const eventPayload = data?.payload;
	if (
		typeof data?.event_type !== "string"
		|| typeof eventPayload?.call_control_id !== "string"
		|| typeof eventPayload.client_state !== "string"
	) {
		return null;
	}

	try {
		const state = JSON.parse(atob(eventPayload.client_state)) as {
			type?: unknown;
			protectedLineId?: unknown;
		};
		if (
			state.type !== CLIENT_STATE_TYPE
			|| !Number.isInteger(state.protectedLineId)
			|| Number(state.protectedLineId) <= 0
		) {
			return null;
		}

		return {
			eventType: data.event_type,
			callControlId: eventPayload.call_control_id,
			clientState: eventPayload.client_state,
			protectedLineId: Number(state.protectedLineId)
		};
	} catch {
		return null;
	}
}

function unavailableReason(config: PostActivationConfirmationConfig): string | null {
	if (config.liveExecution !== "true") {
		return "Telnyx live execution is unavailable for the activation confirmation call.";
	}
	if (!config.apiKey?.trim()) {
		return "TELNYX_API_KEY is required for the activation confirmation call.";
	}
	if (!config.callControlApplicationId?.trim()) {
		return "TELNYX_CALL_CONTROL_APPLICATION_ID is required for the activation confirmation call.";
	}
	return null;
}

function telnyxCallControlId(body: unknown): string | null {
	if (!body || typeof body !== "object") {
		return null;
	}
	const data = (body as { data?: unknown }).data;
	if (!data || typeof data !== "object") {
		return null;
	}
	const id = (data as { call_control_id?: unknown }).call_control_id;
	return typeof id === "string" && id.trim() ? id.trim() : null;
}

async function readResult(
	db: D1Database,
	protectedLineId: number
): Promise<PostActivationConfirmationResult> {
	const line = await findProtectedLineById(db, protectedLineId);
	if (!line) {
		throw new Error("Protected line not found after confirmation-call update");
	}
	return {
		status: line.activationConfirmationCallStatus,
		initiatedAt: line.activationConfirmationCallInitiatedAt,
		completedAt: line.activationConfirmationCallCompletedAt
	};
}

async function markFailed(
	db: D1Database,
	protectedLineId: number,
	reason: string,
	callControlId: string | null = null
): Promise<void> {
	await db.prepare(`
		UPDATE protected_lines
		SET activation_confirmation_call_status = 'failed',
			activation_confirmation_call_failure_reason = ?,
			updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
			AND activation_confirmation_call_status != 'completed'
			AND (
				? IS NULL
				OR activation_confirmation_call_control_id = ?
			)
	`).bind(reason, protectedLineId, callControlId, callControlId).run();
}

export function isPostActivationConfirmationWebhook(payload: unknown): boolean {
	return parseConfirmationWebhook(payload) !== null;
}

export async function initiatePostActivationConfirmation(
	db: D1Database,
	userId: number,
	protectedLineId: number,
	config: PostActivationConfirmationConfig
): Promise<PostActivationConfirmationResult> {
	const [line, account] = await Promise.all([
		findProtectedLineById(db, protectedLineId),
		findUserById(db, userId)
	]);
	if (!line || line.userId !== userId || !account) {
		throw new Error("Protected line and customer account are required for confirmation");
	}
	if (
		line.coverageStatus !== "active"
		|| line.forwardingStatus !== "confirmed"
		|| !line.systemNumber
	) {
		throw new Error("Protected line must be active before confirmation is initiated");
	}

	const claimed = await db.prepare(`
		UPDATE protected_lines
		SET activation_confirmation_call_status = 'initiating',
			activation_confirmation_call_failure_reason = NULL,
			updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
			AND user_id = ?
			AND coverage_status = 'active'
			AND forwarding_status = 'confirmed'
			AND activation_confirmation_call_status = 'not_started'
	`).bind(protectedLineId, userId).run();

	if (claimed.meta.changes !== 1) {
		return readResult(db, protectedLineId);
	}

	const configurationFailure = unavailableReason(config);
	if (configurationFailure) {
		await markFailed(db, protectedLineId, configurationFailure);
		return readResult(db, protectedLineId);
	}

	const destination = account.contactPhoneNumber?.trim() ?? "";
	if (!destination) {
		await markFailed(
			db,
			protectedLineId,
			"Account contact phone number is unavailable for setup confirmation."
		);
		return readResult(db, protectedLineId);
	}

	try {
		const clientState = confirmationClientState(protectedLineId);
		const response = await postTelnyxJson(config, "/calls", {
			connection_id: config.callControlApplicationId?.trim(),
			to: destination,
			from: line.systemNumber,
			from_display_name: "NoMoreScamCalls",
			client_state: clientState
		});
		if (!response.ok) {
			await markFailed(
				db,
				protectedLineId,
				`Telnyx confirmation call returned status ${response.status}.`
			);
			return readResult(db, protectedLineId);
		}

		const callControlId = telnyxCallControlId(response.body);
		if (!callControlId) {
			await markFailed(
				db,
				protectedLineId,
				"Telnyx accepted the confirmation call without a call-control identifier."
			);
			return readResult(db, protectedLineId);
		}

		const initiatedAt = new Date().toISOString();
		await db.prepare(`
			UPDATE protected_lines
			SET activation_confirmation_call_status = 'initiated',
				activation_confirmation_call_control_id = ?,
				activation_confirmation_call_initiated_at = ?,
				updated_at = ?
			WHERE id = ?
				AND activation_confirmation_call_status = 'initiating'
		`).bind(
			callControlId,
			initiatedAt,
			initiatedAt,
			protectedLineId
		).run();
	} catch (error) {
		await markFailed(
			db,
			protectedLineId,
			error instanceof Error
				? error.message
				: "Activation confirmation call failed."
		);
	}

	return readResult(db, protectedLineId);
}

export async function handlePostActivationConfirmationWebhook(
	payload: unknown,
	db: D1Database,
	config: PostActivationConfirmationConfig
): Promise<Response> {
	const event = parseConfirmationWebhook(payload);
	if (!event) {
		return Response.json({
			received: true,
			processed: false,
			reason: "not_post_activation_confirmation"
		}, { status: 400 });
	}

	const line = await findProtectedLineById(db, event.protectedLineId);
	if (!line || line.coverageStatus !== "active") {
		return Response.json({
			received: true,
			processed: false,
			reason: "post_activation_confirmation_line_unavailable"
		}, { status: 404 });
	}

	if (event.eventType === "call.initiated") {
		await db.prepare(`
			UPDATE protected_lines
			SET activation_confirmation_call_status = 'initiated',
				activation_confirmation_call_control_id = ?,
				activation_confirmation_call_initiated_at = COALESCE(
					activation_confirmation_call_initiated_at,
					CURRENT_TIMESTAMP
				),
				updated_at = CURRENT_TIMESTAMP
			WHERE id = ?
				AND activation_confirmation_call_status = 'initiating'
				AND activation_confirmation_call_control_id IS NULL
		`).bind(event.callControlId, event.protectedLineId).run();
		return Response.json({ received: true, processed: true });
	}

	if (event.eventType === "call.answered") {
		const claimed = await db.prepare(`
			UPDATE protected_lines
			SET activation_confirmation_call_status = 'speaking',
				activation_confirmation_call_control_id = COALESCE(
					activation_confirmation_call_control_id,
					?
				),
				activation_confirmation_call_initiated_at = COALESCE(
					activation_confirmation_call_initiated_at,
					CURRENT_TIMESTAMP
				),
				updated_at = CURRENT_TIMESTAMP
			WHERE id = ?
				AND activation_confirmation_call_status IN ('initiating', 'initiated')
				AND (
					activation_confirmation_call_control_id IS NULL
					OR activation_confirmation_call_control_id = ?
				)
		`).bind(
			event.callControlId,
			event.protectedLineId,
			event.callControlId
		).run();

		if (claimed.meta.changes !== 1) {
			return Response.json({
				received: true,
				processed: false,
				reason: "post_activation_confirmation_already_handled"
			});
		}

		const configurationFailure = unavailableReason(config);
		if (configurationFailure) {
			await markFailed(
				db,
				event.protectedLineId,
				configurationFailure,
				event.callControlId
			);
			return Response.json({
				received: true,
				processed: false,
				reason: "post_activation_confirmation_provider_unavailable"
			});
		}

		try {
			const response = await postTelnyxJson(
				config,
				`/calls/${event.callControlId}/actions/speak`,
				{
					payload: POST_ACTIVATION_CONFIRMATION_MESSAGE,
					language: "en-US",
					voice: "female",
					client_state: event.clientState
				}
			);
			if (!response.ok) {
				await markFailed(
					db,
					event.protectedLineId,
					`Telnyx confirmation speech returned status ${response.status}.`,
					event.callControlId
				);
			}
		} catch (error) {
			await markFailed(
				db,
				event.protectedLineId,
				error instanceof Error
					? error.message
					: "Activation confirmation speech failed.",
				event.callControlId
			);
		}

		return Response.json({ received: true, processed: true });
	}

	if (event.eventType === "call.speak.ended") {
		const completedAt = new Date().toISOString();
		const completed = await db.prepare(`
			UPDATE protected_lines
			SET activation_confirmation_call_status = 'completed',
				activation_confirmation_call_completed_at = ?,
				updated_at = ?
			WHERE id = ?
				AND activation_confirmation_call_status = 'speaking'
				AND activation_confirmation_call_control_id = ?
		`).bind(
			completedAt,
			completedAt,
			event.protectedLineId,
			event.callControlId
		).run();

		if (completed.meta.changes === 1 && !unavailableReason(config)) {
			try {
				await postTelnyxJson(
					config,
					`/calls/${event.callControlId}/actions/hangup`,
					{}
				);
			} catch {
				/* Confirmation has been spoken; hangup remains best-effort. */
			}
		}

		return Response.json({ received: true, processed: completed.meta.changes === 1 });
	}

	if (event.eventType === "call.hangup") {
		await markFailed(
			db,
			event.protectedLineId,
			"Confirmation call ended before speech completed.",
			event.callControlId
		);
		return Response.json({ received: true, processed: true });
	}

	return Response.json({
		received: true,
		processed: false,
		reason: "post_activation_confirmation_event_not_processed"
	});
}
