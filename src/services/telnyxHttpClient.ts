export interface TelnyxHttpClientConfig {
	apiKey?: string;
	baseUrl?: string;
}

export interface TelnyxHttpJsonResult {
	ok: boolean;
	status: number;
	body: unknown;
}

export async function getTelnyxJson(
	config: TelnyxHttpClientConfig,
	endpoint: string
): Promise<TelnyxHttpJsonResult> {
	if (!config.apiKey) {
		throw new Error("TELNYX_API_KEY is required for Telnyx API requests");
	}

	const baseUrl = config.baseUrl ?? "https://api.telnyx.com/v2";
	const response = await fetch(`${baseUrl}${endpoint}`, {
		method: "GET",
		headers: {
			"authorization": `Bearer ${config.apiKey}`,
			"content-type": "application/json"
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
