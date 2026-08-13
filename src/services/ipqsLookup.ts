import type {
	IpqsLookup,
	IpqsLookupResult
} from "./evidenceEngine/block3";
import type {
	Block2EvidenceBox
} from "./evidenceEngine/block2";

const DEFAULT_IPQS_BASE_URL =
	"https://ipqualityscore.com/api/json/phone";

export interface IpqsLookupConfig {
	apiKey?: string;
	baseUrl?: string;
	fetch?: typeof fetch;
}

interface UnavailableIpqsEvidence {
	available: false;
	error: string;
	status?: number;
	providerResponse?: unknown;
}

function unavailableResult(
	error: string,
	details: {
		status?: number;
		providerResponse?: unknown;
	} = {}
): IpqsLookupResult {
	const response: UnavailableIpqsEvidence = {
		available: false,
		error
	};

	if (details.status !== undefined) {
		response.status = details.status;
	}

	if (details.providerResponse !== undefined) {
		response.providerResponse =
			details.providerResponse;
	}

	return {
		response,
		valid: null,
		active: null,
		recent_abuse: null,
		spammer: null
	};
}

function extractCallerNumber(
	block2EvidenceBox: Block2EvidenceBox
): string | null {
	const information =
		block2EvidenceBox.callingNumberInformation;

	if (
		typeof information !== "object"
		|| information === null
	) {
		return null;
	}

	const phoneNumber = (
		information as Record<string, unknown>
	).phoneNumber;

	return typeof phoneNumber === "string"
		&& phoneNumber.trim() !== ""
		? phoneNumber.trim()
		: null;
}

function approvedBoolean(
	value: unknown
): boolean | null {
	return typeof value === "boolean"
		? value
		: null;
}

async function readProviderResponse(
	response: Response
): Promise<unknown> {
	const text = await response.text();

	if (text === "") {
		return null;
	}

	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}

export function createIpqsLookup(
	config: IpqsLookupConfig
): IpqsLookup {
	const request = config.fetch ?? fetch;
	const baseUrl =
		config.baseUrl ?? DEFAULT_IPQS_BASE_URL;

	return {
		async lookup(
			block2EvidenceBox: Block2EvidenceBox
		): Promise<IpqsLookupResult> {
			if (!config.apiKey) {
				return unavailableResult(
					"IPQS_API_KEY is not configured."
				);
			}

			const callerNumber =
				extractCallerNumber(block2EvidenceBox);

			if (!callerNumber) {
				return unavailableResult(
					"The Block 2 evidence does not contain a caller phone number."
				);
			}

			let url: URL;

			try {
				url = new URL(baseUrl);
			} catch {
				return unavailableResult(
					"IPQS_API_BASE_URL is invalid."
				);
			}

			url.searchParams.set(
				"phone",
				callerNumber
			);

			let response: Response;

			try {
				response = await request(url, {
					method: "GET",
					headers: {
						"IPQS-KEY": config.apiKey,
						"accept": "application/json"
					}
				});
			} catch (error) {
				return unavailableResult(
					`IPQS request failed: ${
						error instanceof Error
							? error.message
							: "Unknown provider error."
					}`
				);
			}

			let providerResponse: unknown;

			try {
				providerResponse =
					await readProviderResponse(response);
			} catch (error) {
				return unavailableResult(
					`IPQS response could not be read: ${
						error instanceof Error
							? error.message
							: "Unknown provider error."
					}`,
					{ status: response.status }
				);
			}

			if (!response.ok) {
				return unavailableResult(
					`IPQS returned status ${response.status}.`,
					{
						status: response.status,
						providerResponse
					}
				);
			}

			if (
				typeof providerResponse !== "object"
				|| providerResponse === null
			) {
				return unavailableResult(
					"IPQS returned an unusable response.",
					{ providerResponse }
				);
			}

			const result = providerResponse as
				Record<string, unknown>;

			if (result.success !== true) {
				return unavailableResult(
					"IPQS reported that the lookup was unsuccessful.",
					{ providerResponse }
				);
			}

			return {
				response: providerResponse,
				valid:
					approvedBoolean(result.valid),
				active:
					approvedBoolean(result.active),
				recent_abuse:
					approvedBoolean(result.recent_abuse),
				spammer:
					approvedBoolean(result.spammer)
			};
		}
	};
}
