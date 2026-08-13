import type {
	CallerResponseEvaluation,
	CallerResponseEvaluator,
	CallerResponseInput
} from "./evidenceEngine/responseExtraction";

const DEFAULT_OPENAI_BASE_URL =
	"https://api.openai.com/v1";

const EVALUATION_INSTRUCTIONS = `Evaluate only the current caller-response transcript.
Determine independently whether it contains an acceptable caller name and an acceptable reason for calling.
Extract the caller name and reason when present.
Use null when a name or reason is absent or unusable.
Do not assess scam likelihood, trustworthiness, reputation, emotion, routing, scoring, deductions, or IPQS.`;

const EVALUATION_SCHEMA = {
	type: "object",
	properties: {
		nameAccepted: { type: "boolean" },
		reasonAccepted: { type: "boolean" },
		extractedName: {
			anyOf: [
				{ type: "string", minLength: 1 },
				{ type: "null" }
			]
		},
		extractedReason: {
			anyOf: [
				{ type: "string", minLength: 1 },
				{ type: "null" }
			]
		}
	},
	required: [
		"nameAccepted",
		"reasonAccepted",
		"extractedName",
		"extractedReason"
	],
	additionalProperties: false
} as const;

export interface OpenAICallerResponseEvaluatorConfig {
	apiKey: string;
	model: string;
	baseUrl?: string;
	fetch?: typeof fetch;
}

interface OpenAIResponseContent {
	type?: string;
	text?: string;
	refusal?: string;
}

interface OpenAIResponseBody {
	output?: Array<{
		type?: string;
		content?: OpenAIResponseContent[];
	}>;
}

function extractOutputText(
	body: OpenAIResponseBody
): string {
	for (const output of body.output ?? []) {
		for (const content of output.content ?? []) {
			if (content.type === "refusal") {
				throw new Error(
					"OpenAI refused the caller-response evaluation."
				);
			}

			if (
				content.type === "output_text"
				&& typeof content.text === "string"
			) {
				return content.text;
			}
		}
	}

	throw new Error(
		"OpenAI caller-response evaluation did not contain structured output text."
	);
}

function validateEvaluation(
	value: unknown
): CallerResponseEvaluation {
	if (
		typeof value !== "object"
		|| value === null
	) {
		throw new Error(
			"OpenAI caller-response evaluation returned an invalid result."
		);
	}

	const result = value as Record<string, unknown>;
	const validExtractedValue = (
		field: unknown
	): field is string | null =>
		field === null
		|| (
			typeof field === "string"
			&& field.trim() !== ""
		);

	if (
		typeof result.nameAccepted !== "boolean"
		|| typeof result.reasonAccepted !== "boolean"
		|| !validExtractedValue(result.extractedName)
		|| !validExtractedValue(result.extractedReason)
	) {
		throw new Error(
			"OpenAI caller-response evaluation returned an invalid result."
		);
	}

	return {
		nameAccepted: result.nameAccepted,
		reasonAccepted: result.reasonAccepted,
		extractedName:
			typeof result.extractedName === "string"
				? result.extractedName.trim()
				: null,
		extractedReason:
			typeof result.extractedReason === "string"
				? result.extractedReason.trim()
				: null
	};
}

export function createOpenAICallerResponseEvaluator(
	config: OpenAICallerResponseEvaluatorConfig
): CallerResponseEvaluator {
	if (!config.apiKey) {
		throw new Error(
			"OPENAI_API_KEY is required for caller-response evaluation."
		);
	}

	if (!config.model) {
		throw new Error(
			"OPENAI_CALLER_RESPONSE_MODEL is required for caller-response evaluation."
		);
	}

	const request = config.fetch ?? fetch;
	const baseUrl =
		config.baseUrl ?? DEFAULT_OPENAI_BASE_URL;

	return {
		async evaluate(
			input: CallerResponseInput
		): Promise<CallerResponseEvaluation> {
			let response: Response;

			try {
				response = await request(
					`${baseUrl}/responses`,
					{
						method: "POST",
						headers: {
							"authorization":
								`Bearer ${config.apiKey}`,
							"content-type":
								"application/json"
						},
						body: JSON.stringify({
							model: config.model,
							store: false,
							input: [
								{
									role: "system",
									content:
										EVALUATION_INSTRUCTIONS
								},
								{
									role: "user",
									content: JSON.stringify({
										transcript:
											input.transcript,
										language:
											input.language
									})
								}
							],
							text: {
								format: {
									type: "json_schema",
									name:
										"caller_response_evaluation",
									strict: true,
									schema:
										EVALUATION_SCHEMA
								}
							}
						})
					}
				);
			} catch (error) {
				throw new Error(
					`OpenAI caller-response evaluation request failed: ${
						error instanceof Error
							? error.message
							: "Unknown provider error."
					}`
				);
			}

			if (!response.ok) {
				throw new Error(
					`OpenAI caller-response evaluation failed with status ${response.status}.`
				);
			}

			let body: OpenAIResponseBody;

			try {
				body = await response.json<OpenAIResponseBody>();
			} catch {
				throw new Error(
					"OpenAI caller-response evaluation returned invalid JSON."
				);
			}

			const outputText = extractOutputText(body);
			let evaluation: unknown;

			try {
				evaluation = JSON.parse(outputText);
			} catch {
				throw new Error(
					"OpenAI caller-response evaluation returned invalid structured output."
				);
			}

			return validateEvaluation(evaluation);
		}
	};
}
