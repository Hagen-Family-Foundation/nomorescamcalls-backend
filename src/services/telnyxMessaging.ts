import {
	BetaInvitationError,
	respondToBetaInvitationBySms
} from "./betaInvitations";
import type {
	CustomerCommunicationMessage,
	CustomerCommunicationProvider
} from "./customerCommunications";
import {
	postTelnyxJson,
	type TelnyxHttpClientConfig
} from "./telnyxHttpClient";

export interface TelnyxMessagingConfig extends TelnyxHttpClientConfig {
	liveExecution?: string;
	messagingProfileId?: string;
	fromNumber?: string;
	portalOrigin?: string;
}

export interface TelnyxInboundSms {
	eventId: string | null;
	messageId: string | null;
	messagingProfileId: string;
	fromNumber: string;
	toNumbers: string[];
	text: string;
}

function telnyxMessagingUnavailableReason(
	config: TelnyxMessagingConfig
): string | null {
	if (config.liveExecution !== "true") {
		return "Telnyx SMS live execution requires TELNYX_LIVE_EXECUTION=true.";
	}
	if (!config.apiKey?.trim()) {
		return "Telnyx SMS requires TELNYX_API_KEY.";
	}
	if (!config.messagingProfileId?.trim()) {
		return "Telnyx SMS requires TELNYX_MESSAGING_PROFILE_ID.";
	}
	if (!config.fromNumber?.trim()) {
		return "Telnyx SMS requires TELNYX_MESSAGING_FROM_NUMBER.";
	}
	if (!config.portalOrigin?.trim()) {
		return "Telnyx SMS requires PORTAL_ORIGIN for credential-bearing onboarding links.";
	}

	return null;
}

function telnyxErrorDetail(body: unknown): string {
	if (!body || typeof body !== "object") {
		return typeof body === "string" && body.trim()
			? body.trim()
			: "Unknown Telnyx Messaging error";
	}

	const errors = (body as { errors?: unknown }).errors;
	if (!Array.isArray(errors)) {
		return "Unknown Telnyx Messaging error";
	}

	return errors
		.map((error) => {
			if (!error || typeof error !== "object") {
				return null;
			}
			const detail = (error as { detail?: unknown }).detail;
			const title = (error as { title?: unknown }).title;
			return typeof detail === "string"
				? detail
				: typeof title === "string"
					? title
					: null;
		})
		.filter((detail): detail is string => Boolean(detail))
		.join("; ") || "Unknown Telnyx Messaging error";
}

function telnyxMessageId(body: unknown): string | null {
	if (!body || typeof body !== "object") {
		return null;
	}
	const data = (body as { data?: unknown }).data;
	if (!data || typeof data !== "object") {
		return null;
	}
	const id = (data as { id?: unknown }).id;
	return typeof id === "string" && id.trim() ? id.trim() : null;
}

export function createTelnyxSmsProvider(
	config: TelnyxMessagingConfig
): CustomerCommunicationProvider {
	const unavailableReason = telnyxMessagingUnavailableReason(config);

	return {
		name: "telnyx",
		channel: "sms",
		unavailableReason,
		async send(message: CustomerCommunicationMessage) {
			if (message.channel !== "sms") {
				throw new Error("Telnyx SMS provider cannot send email messages");
			}
			if (unavailableReason) {
				throw new Error(unavailableReason);
			}

			const response = await postTelnyxJson(
				config,
				"/messages",
				{
					from: config.fromNumber?.trim(),
					to: message.destination,
					text: message.body,
					messaging_profile_id: config.messagingProfileId?.trim()
				}
			);

			if (!response.ok) {
				throw new Error(
					`Telnyx Messaging API returned ${response.status}: ${telnyxErrorDetail(response.body)}`
				);
			}

			const providerMessageId = telnyxMessageId(response.body);
			if (!providerMessageId) {
				throw new Error(
					"Telnyx Messaging accepted the request without a message identifier"
				);
			}

			return { providerMessageId };
		}
	};
}

export function isTelnyxMessagingWebhook(payload: unknown): boolean {
	if (!payload || typeof payload !== "object") {
		return false;
	}
	const data = (payload as { data?: unknown }).data;
	if (!data || typeof data !== "object") {
		return false;
	}
	const eventType = (data as { event_type?: unknown }).event_type;
	return typeof eventType === "string" && eventType.startsWith("message.");
}

export function normalizeTelnyxInboundSms(
	payload: unknown
): TelnyxInboundSms | null {
	if (!payload || typeof payload !== "object") {
		return null;
	}
	const data = (payload as { data?: unknown }).data;
	if (!data || typeof data !== "object") {
		return null;
	}
	const event = data as {
		event_type?: unknown;
		id?: unknown;
		payload?: unknown;
	};
	if (event.event_type !== "message.received" || !event.payload
		|| typeof event.payload !== "object") {
		return null;
	}

	const message = event.payload as {
		id?: unknown;
		direction?: unknown;
		type?: unknown;
		messaging_profile_id?: unknown;
		from?: unknown;
		to?: unknown;
		text?: unknown;
	};
	const from = message.from && typeof message.from === "object"
		? (message.from as { phone_number?: unknown }).phone_number
		: null;
	const toNumbers = Array.isArray(message.to)
		? message.to
			.map((recipient) => recipient && typeof recipient === "object"
				? (recipient as { phone_number?: unknown }).phone_number
				: null)
			.filter((number): number is string => typeof number === "string")
			.map((number) => number.trim())
			.filter(Boolean)
		: [];

	if (
		message.direction !== "inbound"
		|| message.type !== "SMS"
		|| typeof from !== "string"
		|| !from.trim()
		|| typeof message.messaging_profile_id !== "string"
		|| !message.messaging_profile_id.trim()
		|| typeof message.text !== "string"
		|| toNumbers.length === 0
	) {
		return null;
	}

	return {
		eventId: typeof event.id === "string" ? event.id : null,
		messageId: typeof message.id === "string" ? message.id : null,
		messagingProfileId: message.messaging_profile_id.trim(),
		fromNumber: from.trim(),
		toNumbers,
		text: message.text
	};
}

export async function handleTelnyxMessagingWebhook(
	payload: unknown,
	db: D1Database,
	config: TelnyxMessagingConfig
): Promise<Response> {
	const inbound = normalizeTelnyxInboundSms(payload);
	if (!inbound) {
		return Response.json({
			received: true,
			processed: false,
			reason: "unsupported_telnyx_messaging_event"
		});
	}

	const configuredFromNumber = config.fromNumber?.trim() ?? "";
	const configuredProfileId = config.messagingProfileId?.trim() ?? "";
	if (!configuredFromNumber || !configuredProfileId) {
		return Response.json({
			received: false,
			processed: false,
			reason: "telnyx_messaging_configuration_unavailable"
		}, { status: 503 });
	}

	if (
		inbound.messagingProfileId !== configuredProfileId
		|| !inbound.toNumbers.includes(configuredFromNumber)
	) {
		return Response.json({
			received: true,
			processed: false,
			reason: "telnyx_messaging_context_mismatch"
		});
	}

	try {
		const result = await respondToBetaInvitationBySms(
			db,
			{
				smsContactNumber: inbound.fromNumber,
				response: inbound.text
			},
			{
				provider: createTelnyxSmsProvider(config),
				portalOrigin: config.portalOrigin
			}
		);

		return Response.json({
			received: true,
			processed: true,
			accepted: result.accepted,
			invitationId: result.invitation.id,
			credentialIssued: result.credential !== null,
			deliveryStatus: result.delivery?.status ?? null,
			eventId: inbound.eventId,
			messageId: inbound.messageId
		});
	} catch (error) {
		if (error instanceof BetaInvitationError) {
			return Response.json({
				received: true,
				processed: false,
				reason: error.code,
				eventId: inbound.eventId,
				messageId: inbound.messageId
			});
		}

		throw error;
	}
}
