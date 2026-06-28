import { getTelnyxJson, type TelnyxHttpClientConfig } from "./telnyxHttpClient";

export interface TelnyxSipCredentialRecord {
	id: string | null;
	sipUsername: string;
	connectionId: string | null;
}

export interface VerifyTelnyxSipUsernameResult {
	mode: "simulated" | "live" | "live_failed";
	verified: boolean;
	sipUsername: string;
	reason: string;
	status?: number;
	responseBody?: unknown;
}

export async function verifyTelnyxSipUsername(
	config: TelnyxHttpClientConfig = {},
	sipUsername: string
): Promise<VerifyTelnyxSipUsernameResult> {
	if (!sipUsername) {
		return {
			mode: "simulated",
			verified: false,
			sipUsername,
			reason: "SIP username is required before Telnyx verification."
		};
	}

	if (!config.apiKey) {
		return {
			mode: "simulated",
			verified: false,
			sipUsername,
			reason: "Telnyx SIP username verification is simulated until TELNYX_API_KEY is configured."
		};
	}

	const response = await getTelnyxJson(
		config,
		"/credential_connections"
	);

	const credentials = normalizeTelnyxSipCredentialPayload(response.body);
	const verified = credentials.some((credential) => credential.sipUsername === sipUsername);

	if (!response.ok) {
		return {
			mode: "live_failed",
			verified: false,
			sipUsername,
			reason: "Telnyx credential connection API returned a non-success status.",
			status: response.status,
			responseBody: response.body
		};
	}

	return {
		mode: "live",
		verified,
		sipUsername,
		reason: verified
			? "SIP username was verified against Telnyx credential connections."
			: "SIP username was not found in Telnyx credential connections.",
		status: response.status,
		responseBody: response.body
	};
}

export function normalizeTelnyxSipCredentialPayload(
	payload: unknown
): TelnyxSipCredentialRecord[] {
	if (!payload || typeof payload !== "object" || !("data" in payload)) {
		return [];
	}

	const data = (payload as { data?: unknown }).data;

	if (!Array.isArray(data)) {
		return [];
	}

	return data
		.map((item) => {
			if (!item || typeof item !== "object") {
				return null;
			}

			const row = item as {
				id?: unknown;
				user_name?: unknown;
				username?: unknown;
				connection_id?: unknown;
			};

			const sipUsername = typeof row.user_name === "string"
				? row.user_name
				: typeof row.username === "string"
					? row.username
					: "";

			if (!sipUsername) {
				return null;
			}

			return {
				id: typeof row.id === "string" ? row.id : null,
				sipUsername,
				connectionId: typeof row.connection_id === "string" ? row.connection_id : null
			};
		})
		.filter((record): record is TelnyxSipCredentialRecord => record !== null);
}
