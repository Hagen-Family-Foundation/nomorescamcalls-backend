import { describe, expect, it } from "vitest";
import { normalizeTelnyxPhoneNumberPayload } from "../src/services/telnyxPhoneNumbersClient";

describe("telnyxPhoneNumbersClient", () => {
	it("normalizes Telnyx phone number payloads", () => {
		const numbers = normalizeTelnyxPhoneNumberPayload({
			data: [
				{
					id: "number-id-1",
					phone_number: "+19139562101",
					voice_application_id: "voice-app-1",
					connection_id: "connection-1"
				},
				{
					id: "number-id-2",
					number: "+19139562102"
				},
				{
					id: "missing-number"
				}
			]
		});

		expect(numbers).toEqual([
			{
				phoneNumber: "+19139562101",
				providerNumberId: "number-id-1",
				voiceApplicationId: "voice-app-1",
				connectionId: "connection-1"
			},
			{
				phoneNumber: "+19139562102",
				providerNumberId: "number-id-2",
				voiceApplicationId: null,
				connectionId: null
			}
		]);
	});
});
