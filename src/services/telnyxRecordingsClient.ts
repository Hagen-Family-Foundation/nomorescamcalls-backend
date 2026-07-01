import { getTelnyxJson } from "./telnyxHttpClient";

export interface TelnyxRecordingsClientConfig {
	apiKey?: string;
	baseUrl?: string;
}

export interface FetchTelnyxRecordingsResult {
	mode: "simulated" | "live" | "live_failed";
	reason: string;
	status?: number;
	responseBody?: unknown;
}

export async function fetchTelnyxRecordings(
	config: TelnyxRecordingsClientConfig = {}
): Promise<FetchTelnyxRecordingsResult> {
	if (!config.apiKey) {
		return {
			mode: "simulated",
			reason: "Telnyx recordings fetch is simulated until TELNYX_API_KEY is configured."
		};
	}

	const response = await getTelnyxJson(config, "/recordings");

	if (!response.ok) {
		return {
			mode: "live_failed",
			reason: "Telnyx recordings API returned a non-success status.",
			status: response.status,
			responseBody: response.body
		};
	}

	return {
		mode: "live",
		reason: "Telnyx recordings were fetched successfully.",
		status: response.status,
		responseBody: response.body
	};
}
