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
	matchedRecordings?: unknown[];
}

export async function fetchTelnyxRecordings(
	config: TelnyxRecordingsClientConfig = {},
	callSessionId?: string | null
): Promise<FetchTelnyxRecordingsResult> {
	if (!config.apiKey) {
		return {
			mode: "simulated",
			reason: "Telnyx recordings fetch is simulated until TELNYX_API_KEY is configured."
		};
	}

	const response = await getTelnyxJson(config, "/recordings");
	const matchedRecordings = filterRecordingsByCallSessionId(response.body, callSessionId);

	if (!response.ok) {
		return {
			mode: "live_failed",
			reason: "Telnyx recordings API returned a non-success status.",
			status: response.status,
			responseBody: response.body,
			matchedRecordings
		};
	}

	return {
		mode: "live",
		reason: "Telnyx recordings were fetched successfully.",
		status: response.status,
		responseBody: response.body,
		matchedRecordings
	};
}


export function filterRecordingsByCallSessionId(
	payload: unknown,
	callSessionId?: string | null
): unknown[] {
	if (!callSessionId) {
		return [];
	}

	if (!payload || typeof payload !== "object" || !("data" in payload)) {
		return [];
	}

	const data = (payload as { data?: unknown }).data;

	if (!Array.isArray(data)) {
		return [];
	}

	return data.filter((item) => {
		if (!item || typeof item !== "object") {
			return false;
		}

		return (item as { call_session_id?: unknown }).call_session_id === callSessionId;
	});
}
