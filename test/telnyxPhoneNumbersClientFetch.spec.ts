import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchTelnyxPhoneNumbers } from "../src/services/telnyxPhoneNumbersClient";

describe("fetchTelnyxPhoneNumbers", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("fetches and normalizes Telnyx phone numbers when configured", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
			data: [
				{
					id: "telnyx-number-1",
					phone_number: "+19139562111",
					voice_application_id: "voice-app-1",
					connection_id: "connection-1"
				}
			]
		}), {
			status: 200
		})));

		const result = await fetchTelnyxPhoneNumbers({
			apiKey: "test-api-key",
			baseUrl: "https://api.telnyx.test/v2"
		});

		expect(result.mode).toBe("live");
		expect(result.status).toBe(200);
		expect(result.numbers).toEqual([
			{
				phoneNumber: "+19139562111",
				providerNumberId: "telnyx-number-1",
				voiceApplicationId: "voice-app-1",
				connectionId: "connection-1"
			}
		]);

		expect(fetch).toHaveBeenCalledWith(
			"https://api.telnyx.test/v2/phone_numbers",
			expect.objectContaining({
				method: "GET",
				headers: expect.objectContaining({
					authorization: "Bearer test-api-key"
				})
			})
		);
	});

	it("returns simulated mode when no API key is configured", async () => {
		const result = await fetchTelnyxPhoneNumbers();

		expect(result.mode).toBe("simulated");
		expect(result.numbers).toEqual([]);
	});
});
