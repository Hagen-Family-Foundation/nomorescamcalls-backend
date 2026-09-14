import {
	deleteTelnyxJson,
	getTelnyxJson,
	postTelnyxJson,
	type TelnyxHttpClientConfig
} from "./telnyxHttpClient";

export interface TelnyxSubscriberCredentialConfig extends TelnyxHttpClientConfig {
	credentialConnectionId?: string;
}

export interface TelnyxTelephonyCredential {
	id: string;
	sipUsername: string;
	expiresAt: string | null;
	expired: boolean;
}

export interface TelnyxCredentialToken {
	token: string;
	expiresAt: string;
}

export interface TelnyxRegistrationStatus {
	registered: boolean;
	status: string;
	sipUsername: string | null;
	lastRegistrationAt: string | null;
}

export class TelnyxTelephonyCredentialError extends Error {
	constructor(
		message: string,
		readonly status: number | null = null
	) {
		super(message);
		this.name = "TelnyxTelephonyCredentialError";
	}
}

function requiredConnectionId(config: TelnyxSubscriberCredentialConfig): string {
	const id = config.credentialConnectionId?.trim();
	if (!id) {
		throw new TelnyxTelephonyCredentialError(
			"TELNYX_SUBSCRIBER_CREDENTIAL_CONNECTION_ID is required"
		);
	}
	return id;
}

function dataObject(body: unknown): Record<string, unknown> | null {
	if (!body || typeof body !== "object") return null;
	const data = (body as { data?: unknown }).data;
	return data && typeof data === "object" && !Array.isArray(data)
		? data as Record<string, unknown>
		: null;
}

function parseCredential(body: unknown): TelnyxTelephonyCredential {
	const data = dataObject(body);
	const id = typeof data?.id === "string" ? data.id.trim() : "";
	const sipUsername = typeof data?.sip_username === "string"
		? data.sip_username.trim()
		: "";
	if (!id || !sipUsername) {
		throw new TelnyxTelephonyCredentialError(
			"Telnyx returned an incomplete Telephony Credential"
		);
	}
	return {
		id,
		sipUsername,
		expiresAt: typeof data?.expires_at === "string" ? data.expires_at : null,
		expired: data?.expired === true
	};
}

export async function createTelnyxTelephonyCredential(
	config: TelnyxSubscriberCredentialConfig,
	name: string
): Promise<TelnyxTelephonyCredential> {
	const response = await postTelnyxJson(config, "/telephony_credentials", {
		connection_id: requiredConnectionId(config),
		name,
		tag: "nmsc-subscriber-device"
	});
	if (!response.ok) {
		throw new TelnyxTelephonyCredentialError(
			`Telnyx Telephony Credential creation failed with status ${response.status}`,
			response.status
		);
	}
	// parseCredential deliberately copies only durable identifiers; any generated
	// sip_password in the provider response is discarded here.
	return parseCredential(response.body);
}

export async function retrieveTelnyxTelephonyCredential(
	config: TelnyxHttpClientConfig,
	credentialId: string
): Promise<TelnyxTelephonyCredential> {
	const response = await getTelnyxJson(
		config,
		`/telephony_credentials/${encodeURIComponent(credentialId)}`
	);
	if (!response.ok) {
		throw new TelnyxTelephonyCredentialError(
			`Telnyx Telephony Credential lookup failed with status ${response.status}`,
			response.status
		);
	}
	return parseCredential(response.body);
}

export async function createTelnyxCredentialToken(
	config: TelnyxHttpClientConfig,
	credentialId: string
): Promise<TelnyxCredentialToken> {
	const response = await postTelnyxJson(
		config,
		`/telephony_credentials/${encodeURIComponent(credentialId)}/token`
	);
	if (!response.ok || typeof response.body !== "string" || !response.body.trim()) {
		throw new TelnyxTelephonyCredentialError(
			`Telnyx JWT creation failed with status ${response.status}`,
			response.status
		);
	}
	const payloadPart = response.body.split(".")[1];
	let expiresAt: string;
	try {
		const normalized = payloadPart.replaceAll("-", "+").replaceAll("_", "/");
		const payload = JSON.parse(atob(normalized)) as { exp?: unknown };
		if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) {
			throw new Error("missing exp");
		}
		expiresAt = new Date(payload.exp * 1000).toISOString();
	} catch {
		throw new TelnyxTelephonyCredentialError(
			"Telnyx returned a JWT without a valid expiration"
		);
	}
	return {
		token: response.body,
		expiresAt
	};
}

export async function checkTelnyxCredentialRegistration(
	config: TelnyxSubscriberCredentialConfig,
	expectedSipUsername: string
): Promise<TelnyxRegistrationStatus> {
	const response = await getTelnyxJson(
		config,
		`/sip_registration_status?credential_type=telephony_credential&username=${encodeURIComponent(expectedSipUsername)}`
	);
	if (!response.ok) {
		throw new TelnyxTelephonyCredentialError(
			`Telnyx registration check failed with status ${response.status}`,
			response.status
		);
	}
	const data = dataObject(response.body)
		?? (response.body && typeof response.body === "object"
			? response.body as Record<string, unknown>
			: null);
	const status = typeof data?.sip_registration_status === "string"
		? data.sip_registration_status
		: "unknown";
	const sipUsername = typeof data?.credential_username === "string"
		? data.credential_username
		: null;
	const details = data?.sip_registration_details
		&& typeof data.sip_registration_details === "object"
		? data.sip_registration_details as Record<string, unknown>
		: null;
	return {
		registered:
			sipUsername === expectedSipUsername
			&& data?.credential_type === "telephony_credential"
			&& data?.registered === true
			&& status === "registered",
		status,
		sipUsername,
		lastRegistrationAt:
			typeof details?.last_modified === "string"
				? details.last_modified
				: null
	};
}

export async function deleteTelnyxTelephonyCredential(
	config: TelnyxHttpClientConfig,
	credentialId: string
): Promise<void> {
	const response = await deleteTelnyxJson(
		config,
		`/telephony_credentials/${encodeURIComponent(credentialId)}`
	);
	if (!response.ok && response.status !== 404) {
		throw new TelnyxTelephonyCredentialError(
			`Telnyx Telephony Credential deletion failed with status ${response.status}`,
			response.status
		);
	}
}
