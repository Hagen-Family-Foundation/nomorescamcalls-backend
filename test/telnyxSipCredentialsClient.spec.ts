import { afterEach, describe, expect, it, vi } from "vitest";
import {
	normalizeTelnyxSipCredentialPayload,
	verifyTelnyxSipUsername
} from "../src/services/telnyxSipCredentialsClient";

describe("verifyTelnyxSipUsername", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("verifies a SIP username found in Telnyx credential connections", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
			data: [
				{
					id: "credential-1",
					user_name: "test_user_support_15892",
					connection_id: "connection-1"
				}
			]
		}), {
			status: 200
		})));

		const result = await verifyTelnyxSipUsername(
			{
				apiKey: "test-api-key",
				baseUrl: "https://api.telnyx.test/v2"
			},
			"test_user_support_15892"
		);

		expect(result.mode).toBe("live");
		expect(result.verified).toBe(true);
		expect(result.sipUsername).toBe("test_user_support_15892");

		expect(fetch).toHaveBeenCalledWith(
			"https://api.telnyx.test/v2/credential_connections",
			expect.objectContaining({
				method: "GET",
				headers: expect.objectContaining({
					authorization: "Bearer test-api-key"
				})
			})
		);
	});

	it("rejects a SIP username not found in Telnyx credential connections", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
			data: [
				{
					id: "credential-1",
					user_name: "test_user_support_15892",
					connection_id: "connection-1"
				}
			]
		}), {
			status: 200
		})));

		const result = await verifyTelnyxSipUsername(
			{
				apiKey: "test-api-key",
				baseUrl: "https://api.telnyx.test/v2"
			},
			"not-real"
		);

		expect(result.mode).toBe("live");
		expect(result.verified).toBe(false);
	});

	it("does not verify when no API key is configured", async () => {
		const result = await verifyTelnyxSipUsername(
			{},
			"test_user_support_15892"
		);

		expect(result.mode).toBe("simulated");
		expect(result.verified).toBe(false);
	});

	it("normalizes Telnyx credential payloads", () => {
		expect(normalizeTelnyxSipCredentialPayload({
			data: [
				{
					id: "credential-1",
					user_name: "test_user_support_15892",
					connection_id: "connection-1"
				},
				{
					id: "credential-2",
					username: "backupuser"
				},
				{}
			]
		})).toEqual([
			{
				id: "credential-1",
				sipUsername: "test_user_support_15892",
				connectionId: "connection-1"
			},
			{
				id: "credential-2",
				sipUsername: "backupuser",
				connectionId: null
			}
		]);
	});
});
