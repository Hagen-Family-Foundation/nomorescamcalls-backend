import { describe, expect, it } from "vitest";
import { getTelnyxJson } from "../src/services/telnyxHttpClient";

describe("telnyxHttpClient", () => {
	it("requires an API key before making Telnyx API requests", async () => {
		await expect(getTelnyxJson({}, "/phone_numbers")).rejects.toThrow(
			"TELNYX_API_KEY is required for Telnyx API requests"
		);
	});
});
