export interface TelnyxHttpClientConfig {
	apiKey?: string;
	baseUrl?: string;
}

export interface TelnyxHttpJsonResult {
	ok: boolean;
	status: number;
	body: unknown;
}

async function requestTelnyxJson(
	config: TelnyxHttpClientConfig,
	endpoint: string,
	init: RequestInit
): Promise<TelnyxHttpJsonResult> {
	if (!config.apiKey) {
		throw new Error("TELNYX_API_KEY is required for Telnyx API requests");
	}

	const baseUrl = config.baseUrl ?? "https://api.telnyx.com/v2";
	const response = await fetch(`${baseUrl}${endpoint}`, {
		...init,
		headers: {
			"authorization": `Bearer ${config.apiKey}`,
			"content-type": "application/json",
			...init.headers
		}
	});

	const text = await response.text();
	let body: unknown = text;

	try {
		body = text ? JSON.parse(text) : null;
	} catch {
		body = text;
	}

	return {
		ok: response.ok,
		status: response.status,
		body
	};
}

export async function getTelnyxJson(
	config: TelnyxHttpClientConfig,
	endpoint: string
): Promise<TelnyxHttpJsonResult> {
	return requestTelnyxJson(config, endpoint, { method: "GET" });
}

export async function postTelnyxJson(
	config: TelnyxHttpClientConfig,
	endpoint: string,
	body: Record<string, unknown>
): Promise<TelnyxHttpJsonResult> {
	return requestTelnyxJson(config, endpoint, {
		method: "POST",
		body: JSON.stringify(body)
	});
}
