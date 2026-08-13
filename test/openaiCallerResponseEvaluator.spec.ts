import {
	describe,
	expect,
	it,
	vi
} from "vitest";
import {
	evaluateCallerResponse,
	type CallerResponseEvaluator
} from "../src/services/evidenceEngine";
import {
	createOpenAICallerResponseEvaluator
} from "../src/services/openaiCallerResponseEvaluator";

function providerResponse(value: unknown): Response {
	return new Response(
		JSON.stringify({
			output: [
				{
					type: "message",
					content: [
						{
							type: "output_text",
							text: JSON.stringify(value)
						}
					]
				}
			]
		}),
		{
			status: 200,
			headers: {
				"content-type": "application/json"
			}
		}
	);
}

function evaluatorWith(
	result: unknown
): {
	evaluator: CallerResponseEvaluator;
	request: ReturnType<typeof vi.fn>;
} {
	const request = vi.fn().mockResolvedValue(
		providerResponse(result)
	);

	return {
		evaluator: createOpenAICallerResponseEvaluator({
			apiKey: "test-key",
			model: "test-model",
			fetch: request
		}),
		request
	};
}

describe("OpenAI caller-response evaluator", () => {
	it("accepts and extracts a valid name and reason", async () => {
		const { evaluator, request } = evaluatorWith({
			nameAccepted: true,
			reasonAccepted: true,
			extractedName: "Maria Alvarez",
			extractedReason: "calling about the invoice"
		});

		await expect(evaluator.evaluate({
			transcript:
				"This is Maria Alvarez calling about the invoice.",
			language: "en"
		})).resolves.toEqual({
			nameAccepted: true,
			reasonAccepted: true,
			extractedName: "Maria Alvarez",
			extractedReason: "calling about the invoice"
		});

		const [url, init] = request.mock.calls[0];
		expect(url).toBe("https://api.openai.com/v1/responses");
		const body = JSON.parse(String(init.body));
		expect(body).toMatchObject({
			model: "test-model",
			store: false,
			text: {
				format: {
					type: "json_schema",
					strict: true
				}
			}
		});
		expect(body.input[1].content).toBe(JSON.stringify({
			transcript:
				"This is Maria Alvarez calling about the invoice.",
			language: "en"
		}));
	});

	it("rejects a missing name independently of a valid reason", async () => {
		const { evaluator } = evaluatorWith({
			nameAccepted: false,
			reasonAccepted: true,
			extractedName: null,
			extractedReason: "calling about the invoice"
		});

		await expect(evaluator.evaluate({
			transcript: "I'm calling about the invoice.",
			language: "en"
		})).resolves.toMatchObject({
			nameAccepted: false,
			reasonAccepted: true,
			extractedName: null
		});
	});

	it("rejects a missing reason independently of a valid name", async () => {
		const { evaluator } = evaluatorWith({
			nameAccepted: true,
			reasonAccepted: false,
			extractedName: "Maria Alvarez",
			extractedReason: null
		});

		await expect(evaluator.evaluate({
			transcript: "This is Maria Alvarez.",
			language: "en"
		})).resolves.toMatchObject({
			nameAccepted: true,
			reasonAccepted: false,
			extractedReason: null
		});
	});

	it("keeps empty transcripts local and avoids the provider", async () => {
		const { evaluator, request } = evaluatorWith({
			nameAccepted: true,
			reasonAccepted: true,
			extractedName: "unused",
			extractedReason: "unused"
		});

		await expect(evaluateCallerResponse(
			"  ",
			null,
			evaluator
		)).resolves.toMatchObject({
			nameAccepted: false,
			reasonAccepted: false,
			extractedName: null,
			extractedReason: null
		});
		expect(request).not.toHaveBeenCalled();
	});

	it("rejects invalid structured provider output", async () => {
		const { evaluator } = evaluatorWith({
			nameAccepted: "yes",
			reasonAccepted: true,
			extractedName: "Maria",
			extractedReason: "invoice"
		});

		await expect(evaluator.evaluate({
			transcript: "This is Maria about the invoice.",
			language: "en"
		})).rejects.toThrow(
			"returned an invalid result"
		);
	});

	it("surfaces provider request failures", async () => {
		const request = vi.fn().mockRejectedValue(
			new Error("network unavailable")
		);
		const evaluator: CallerResponseEvaluator =
			createOpenAICallerResponseEvaluator({
				apiKey: "test-key",
				model: "test-model",
				fetch: request
			});

		await expect(evaluator.evaluate({
			transcript: "This is Maria about the invoice.",
			language: "en"
		})).rejects.toThrow(
			"network unavailable"
		);
	});

	it("surfaces unsuccessful provider responses", async () => {
		const request = vi.fn().mockResolvedValue(
			new Response("provider error", { status: 503 })
		);
		const evaluator =
			createOpenAICallerResponseEvaluator({
				apiKey: "test-key",
				model: "test-model",
				fetch: request
			});

		await expect(evaluator.evaluate({
			transcript: "This is Maria about the invoice.",
			language: "en"
		})).rejects.toThrow("status 503");
	});
});
