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
