import { getTelnyxJson } from "./telnyxHttpClient";

export interface TelnyxVoiceApplicationsClientConfig {
	apiKey?: string;
	baseUrl?: string;
}

export interface FetchTelnyxVoiceApplicationResult {
	mode: "simulated" | "live" | "live_failed";
	reason: string;
	status?: number;
	responseBody?: unknown;
}

export async function fetchTelnyxVoiceApplication(
	voiceApplicationId: string,
	config: TelnyxVoiceApplicationsClientConfig = {}
): Promise<FetchTelnyxVoiceApplicationResult> {
	if (!config.apiKey) {
		return {
			mode: "simulated",
			reason: "Telnyx Voice Application fetch is simulated until TELNYX_API_KEY is configured."
		};
	}

	const response = await getTelnyxJson(
		config,
		`/call_control_applications/${voiceApplicationId}`
	);

	if (!response.ok) {
		return {
			mode: "live_failed",
			reason: "Telnyx Voice Application API returned a non-success status.",
			status: response.status,
			responseBody: response.body
		};
	}

	return {
		mode: "live",
		reason: "Telnyx Voice Application was fetched successfully.",
		status: response.status,
		responseBody: response.body
	};
}
