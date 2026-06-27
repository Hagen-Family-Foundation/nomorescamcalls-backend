import type { SimulatedTelnyxRequest } from "./telnyxRequests";
import type { TelnyxExecutionPolicy } from "./telnyxExecutionPolicy";

export interface TelnyxApiConfig {
	apiKey?: string;
	baseUrl?: string;
}

export interface TelnyxExecutionResult {
	mode: "disabled" | "live" | "live_config_missing" | "live_failed";
	executed: boolean;
	reason: string;
	request: SimulatedTelnyxRequest | null;
	policy: TelnyxExecutionPolicy;
	status?: number;
	responseBody?: unknown;
}

export async function executeTelnyxRequest(
	request: SimulatedTelnyxRequest | null,
	policy: TelnyxExecutionPolicy,
	apiConfig: TelnyxApiConfig = {}
): Promise<TelnyxExecutionResult> {
	if (!request) {
		return {
			mode: "disabled",
			executed: false,
			reason: "No Telnyx request was planned.",
			request,
			policy
		};
	}

	if (!policy.liveExecutionAllowed) {
		return {
			mode: "disabled",
			executed: false,
			reason: policy.reason,
			request,
			policy
		};
	}

	if (request.body.liveApiReady !== true) {
		return {
			mode: "disabled",
			executed: false,
			reason: "Telnyx live execution was requested, but this request body is not explicitly marked liveApiReady.",
			request,
			policy
		};
	}

	if (!apiConfig.apiKey) {
		return {
			mode: "live_config_missing",
			executed: false,
			reason: "Live Telnyx execution was enabled, but TELNYX_API_KEY is missing.",
			request,
			policy
		};
	}

	const baseUrl = apiConfig.baseUrl ?? "https://api.telnyx.com/v2";
	const url = `${baseUrl}${request.endpoint}`;
	const {
		liveApiReady,
		destinationType,
		appIdentity,
		routingReason,
		...liveRequestBody
	} = request.body;

	try {
		const response = await fetch(url, {
			method: request.method,
			headers: {
				"authorization": `Bearer ${apiConfig.apiKey}`,
				"content-type": "application/json"
			},
			body: JSON.stringify(liveRequestBody)
		});

		const responseText = await response.text();
		let responseBody: unknown = responseText;

		try {
			responseBody = responseText ? JSON.parse(responseText) : null;
		} catch {
			responseBody = responseText;
		}

		if (!response.ok) {
			return {
				mode: "live_failed",
				executed: true,
				reason: "Telnyx API request was sent but returned a non-success status.",
				request,
				policy,
				status: response.status,
				responseBody
			};
		}

		return {
			mode: "live",
			executed: true,
			reason: "Telnyx API request was sent successfully.",
			request,
			policy,
			status: response.status,
			responseBody
		};
	} catch (error) {
		return {
			mode: "live_failed",
			executed: false,
			reason: error instanceof Error ? error.message : "Unknown Telnyx API execution error.",
			request,
			policy
		};
	}
}
