export interface TelnyxPhoneNumberRecord {
	phoneNumber: string;
	providerNumberId: string | null;
	voiceApplicationId: string | null;
	connectionId: string | null;
}

export interface TelnyxPhoneNumbersClientConfig {
	apiKey?: string;
	baseUrl?: string;
}

export interface FetchTelnyxPhoneNumbersResult {
	mode: "simulated" | "live_config_missing";
	numbers: TelnyxPhoneNumberRecord[];
	reason: string;
}

export async function fetchTelnyxPhoneNumbers(
	config: TelnyxPhoneNumbersClientConfig = {}
): Promise<FetchTelnyxPhoneNumbersResult> {
	if (!config.apiKey) {
		return {
			mode: "simulated",
			numbers: [],
			reason: "Telnyx phone number sync is simulated until TELNYX_API_KEY is configured."
		};
	}

	return {
		mode: "live_config_missing",
		numbers: [],
		reason: "Live Telnyx phone number fetching has not been enabled yet."
	};
}

export function normalizeTelnyxPhoneNumberPayload(
	payload: unknown
): TelnyxPhoneNumberRecord[] {
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
				phone_number?: unknown;
				number?: unknown;
				voice_application_id?: unknown;
				connection_id?: unknown;
			};

			const phoneNumber = typeof row.phone_number === "string"
				? row.phone_number
				: typeof row.number === "string"
					? row.number
					: "";

			if (!phoneNumber) {
				return null;
			}

			return {
				phoneNumber,
				providerNumberId: typeof row.id === "string" ? row.id : null,
				voiceApplicationId: typeof row.voice_application_id === "string" ? row.voice_application_id : null,
				connectionId: typeof row.connection_id === "string" ? row.connection_id : null
			};
		})
		.filter((record): record is TelnyxPhoneNumberRecord => record !== null);
}
