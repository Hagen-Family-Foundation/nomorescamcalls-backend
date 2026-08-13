import {
	describe,
	expect,
	it,
	vi
} from "vitest";
import {
	completeBlock1,
	completeBlock2,
	completeBlock3,
	type Block3CallController,
	type CallerResponseEvaluator,
	type IpqsLookup
} from "../src/services/evidenceEngine";
import {
	createIpqsLookup
} from "../src/services/ipqsLookup";

function block2EvidenceBox() {
	return completeBlock2({
		block1EvidenceBox: completeBlock1({
			callInformation: {
				from: "+18005551234"
			},
			callRecord: {},
			billingTimer: {}
		}),
		screeningInformation: {
			callingNumberInformation: {
				phoneNumber: "+18005551234"
			},
			stirShakenInformation: {},
			cnamInformation: {},
			carrierLineLookupInformation: {}
		}
	});
}

function response(
	body: unknown,
	status = 200
): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			"content-type": "application/json"
		}
	});
}

describe("production IPQS lookup", () => {
	it("maps all approved fields and preserves the complete response", async () => {
		const providerResponse = {
			success: true,
			message: "Phone is valid.",
			valid: false,
			active: true,
			recent_abuse: true,
			spammer: false,
			fraud_score: 97,
			carrier: "Example Carrier",
			request_id: "provider-request-id"
		};
		const request = vi.fn().mockResolvedValue(
			response(providerResponse)
		);
		const lookup: IpqsLookup = createIpqsLookup({
			apiKey: "test-key",
			fetch: request
		});

		await expect(lookup.lookup(
			block2EvidenceBox()
		)).resolves.toEqual({
			response: providerResponse,
			valid: false,
			active: true,
			recent_abuse: true,
			spammer: false
		});

		const [url, init] = request.mock.calls[0];
		expect(String(url)).toBe(
			"https://ipqualityscore.com/api/json/phone?phone=%2B18005551234"
		);
		expect(init).toMatchObject({
			method: "GET",
			headers: {
				"IPQS-KEY": "test-key",
				accept: "application/json"
			}
		});
	});

	it("maps missing or unusable approved fields to null without guessing", async () => {
		const providerResponse = {
			success: true,
			valid: true,
			active: "unknown",
			recent_abuse: null,
			fraud_score: 100
		};
		const lookup = createIpqsLookup({
			apiKey: "test-key",
			fetch: vi.fn().mockResolvedValue(
				response(providerResponse)
			)
		});

		await expect(lookup.lookup(
			block2EvidenceBox()
		)).resolves.toEqual({
			response: providerResponse,
			valid: true,
			active: null,
			recent_abuse: null,
			spammer: null
		});
	});

	it("returns zero-adverse evidence for a network failure", async () => {
		const lookup = createIpqsLookup({
			apiKey: "test-key",
			fetch: vi.fn().mockRejectedValue(
				new Error("network unavailable")
			)
		});

		const result = await lookup.lookup(
			block2EvidenceBox()
		);

		expect(result).toMatchObject({
			response: {
				available: false,
				error:
					"IPQS request failed: network unavailable"
			},
			valid: null,
			active: null,
			recent_abuse: null,
			spammer: null
		});
	});

	it("returns zero-adverse evidence for provider failure and preserves its response", async () => {
		const providerResponse = {
			success: false,
			message: "Invalid API key."
		};
		const lookup = createIpqsLookup({
			apiKey: "test-key",
			fetch: vi.fn().mockResolvedValue(
				response(providerResponse, 401)
			)
		});

		await expect(lookup.lookup(
			block2EvidenceBox()
		)).resolves.toMatchObject({
			response: {
				available: false,
				status: 401,
				providerResponse
			},
			valid: null,
			active: null,
			recent_abuse: null,
			spammer: null
		});
	});

	it("does not let unapproved provider fields affect live scoring", async () => {
		const lookup = createIpqsLookup({
			apiKey: "test-key",
			fetch: vi.fn().mockResolvedValue(response({
				success: true,
				valid: true,
				active: true,
				recent_abuse: false,
				spammer: false,
				fraud_score: 100,
				risky: true,
				VOIP: true
			}))
		});
		const evaluator: CallerResponseEvaluator = {
			evaluate: vi.fn()
				.mockResolvedValueOnce({
					nameAccepted: false,
					reasonAccepted: true,
					extractedName: null,
					extractedReason: "an appointment"
				})
				.mockResolvedValueOnce({
					nameAccepted: true,
					reasonAccepted: true,
					extractedName: "Maria",
					extractedReason: "an appointment"
				})
		};
		const callController: Block3CallController = {
			startRecording: vi.fn(),
			connectSubscriber: vi.fn(),
			playUnavailableAndDisconnect: vi.fn(),
			playTechnicalDifficultiesAndDisconnect: vi.fn(),
			stopRecording: vi.fn()
		};

		const result = await completeBlock3({
			block2EvidenceBox: block2EvidenceBox(),
			prompt1: {
				audioRecordingReference: null,
				transcript: "Calling about an appointment.",
				language: "en"
			},
			prompt2: {
				audioRecordingReference: null,
				transcript:
					"Maria calling about an appointment.",
				language: "en"
			},
			evaluator,
			ipqsLookup: lookup,
			callController
		});

		expect(result.ipqsDeductions).toEqual([]);
		expect(result.finalStanding).toBe(100);
	});
});
