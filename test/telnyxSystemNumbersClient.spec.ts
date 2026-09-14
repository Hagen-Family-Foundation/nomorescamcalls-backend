import { afterEach, describe, expect, it, vi } from "vitest";
import {
	configureTelnyxSystemNumbers,
	createTelnyxSystemNumberOrder,
	disableTelnyxSystemNumberVoicemail,
	listTelnyxSystemNumbers,
	retrieveTelnyxSystemNumberVoiceCapability,
	retrieveTelnyxSystemNumberVoicemailState
} from "../src/services/telnyxSystemNumbersClient";
import { SYSTEM_NUMBER_POOL_TAG } from "../src/services/systemNumberPool";

const config = {
	apiKey: "test-api-key",
	baseUrl: "https://telnyx.test/v2"
};

function phoneNumber(id: string, number: string) {
	return {
		id,
		phone_number: number,
		status: "active",
		country_iso_alpha2: "US",
		phone_number_type: "local",
		features: [{ name: "voice" }]
	};
}

describe("Telnyx System Number client", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("retrieves every page before returning provider inventory", async () => {
		const request = vi.fn(async (url: string | URL | Request) => {
			const page = new URL(String(url)).searchParams.get("page[number]");
			return new Response(JSON.stringify({
				data: page === "1"
					? [phoneNumber("provider-1", "+19135550001")]
					: [phoneNumber("provider-2", "+19135550002")],
				meta: { page_number: Number(page), total_pages: 2 }
			}));
		});
		vi.stubGlobal("fetch", request);

		await expect(listTelnyxSystemNumbers(config, {
			tag: SYSTEM_NUMBER_POOL_TAG
		})).resolves.toMatchObject([
			{ providerNumberId: "provider-1", phoneNumber: "+19135550001" },
			{ providerNumberId: "provider-2", phoneNumber: "+19135550002" }
		]);
		expect(request).toHaveBeenCalledTimes(2);
		expect(String(request.mock.calls[0]?.[0])).toContain("filter%5Btag%5D=nmsc-system-number-pool");
	});

	it("rejects a failed later page without returning a partial provider view", async () => {
		const request = vi.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify({
				data: [phoneNumber("provider-1", "+19135550001")],
				meta: { page_number: 1, total_pages: 2 }
			})))
			.mockResolvedValueOnce(new Response("provider unavailable", { status: 503 }));
		vi.stubGlobal("fetch", request);

		await expect(listTelnyxSystemNumbers(config)).rejects.toThrow(
			"page 2 returned 503"
		);
	});

	it("rejects list responses that cannot prove pagination completeness", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
			data: [phoneNumber("provider-1", "+19135550001")]
		}))));

		await expect(listTelnyxSystemNumbers(config)).rejects.toThrow(
			"missing pagination metadata"
		);
	});

	it("submits the approved exact 50-number 913 voice order", async () => {
		const request = vi.fn(async () => new Response(JSON.stringify({
			data: {
				id: "order-1",
				ordering_groups: [{ status: "pending", count_allocated: 0 }]
			}
		})));
		vi.stubGlobal("fetch", request);

		await expect(createTelnyxSystemNumberOrder(
			config,
			"voice-app-1",
			"nmsc-system-number-request-1"
		)).resolves.toEqual({
			providerOrderId: "order-1",
			status: "pending",
			allocatedCount: 0
		});

		expect(request).toHaveBeenCalledTimes(1);
		expect(request.mock.calls[0]?.[1]?.method).toBe("POST");
		expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body))).toEqual({
			ordering_groups: [{
				country_iso: "US",
				count_requested: 50,
				phone_number_type: "local",
				national_destination_code: "913",
				features: ["voice"],
				strategy: "always",
				exclude_held_numbers: true
			}],
			connection_id: "voice-app-1",
			customer_reference: "nmsc-system-number-request-1"
		});
	});

	it("submits the exact permanent provider configuration as one batch job", async () => {
		const request = vi.fn(async () => new Response(JSON.stringify({
			data: { id: "job-1", status: "pending" }
		}), { status: 202 }));
		vi.stubGlobal("fetch", request);

		await expect(configureTelnyxSystemNumbers(
			config,
			["provider-1", "provider-2"],
			"voice-app-1"
		)).resolves.toEqual({ providerJobId: "job-1", status: "pending" });

		expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body))).toEqual({
			phone_numbers: ["provider-1", "provider-2"],
			tags: [SYSTEM_NUMBER_POOL_TAG],
			connection_id: "voice-app-1",
			deletion_lock_enabled: true,
			voice: {
				caller_id_name_enabled: false,
				call_forwarding: {
					call_forwarding_enabled: false,
					forwards_to: ""
				},
				translated_number: "",
				cnam_listing: { cnam_listing_enabled: false },
				call_recording: { inbound_call_recording_enabled: false },
				inbound_call_screening: "flag_calls"
			}
		});
	});

	it("independently verifies voice capability and disabled voicemail", async () => {
		const request = vi.fn(async (url: string | URL | Request) => {
			const path = new URL(String(url)).pathname;
			return path.endsWith("/numbers_features")
				? new Response(JSON.stringify({
					data: [{ phone_number: "+19135550001", features: ["voice"] }]
				}))
				: new Response(JSON.stringify({ data: { enabled: false } }));
		});
		vi.stubGlobal("fetch", request);

		await expect(retrieveTelnyxSystemNumberVoiceCapability(
			config,
			"+19135550001"
		)).resolves.toBe(true);
		await expect(retrieveTelnyxSystemNumberVoicemailState(
			config,
			"provider-1"
		)).resolves.toBe(false);
	});

	it("explicitly disables voicemail and requires provider confirmation", async () => {
		const request = vi.fn(async () => new Response(JSON.stringify({
			data: { enabled: false }
		})));
		vi.stubGlobal("fetch", request);

		await expect(disableTelnyxSystemNumberVoicemail(
			config,
			"provider-1"
		)).resolves.toBeUndefined();
		expect(request.mock.calls[0]?.[1]?.method).toBe("PATCH");
		expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body))).toEqual({
			enabled: false
		});
	});
});
