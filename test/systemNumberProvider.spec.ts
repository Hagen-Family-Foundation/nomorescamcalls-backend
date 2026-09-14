import { env } from "cloudflare:test";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
	SYSTEM_NUMBER_POOL_TAG,
	WORKING_TEST_SYSTEM_NUMBER,
	findSystemNumber,
	registerQuarantinedSystemNumber
} from "../src/services/systemNumberPool";
import {
	evaluateSystemNumberReadiness,
	maintainSystemNumberPool,
	reconcileSystemNumbers
} from "../src/services/systemNumberProvider";
import type {
	TelnyxSystemNumber,
	TelnyxSystemNumberVoiceSettings
} from "../src/services/telnyxSystemNumbersClient";
import { addReadySystemNumber } from "./systemNumberFixtures";
import { ensureTestSchema } from "./testSchema";

const providerConfig = {
	apiKey: "test-api-key",
	baseUrl: "https://telnyx.test/v2",
	voiceApplicationId: "voice-app-1"
};

function readyProviderNumber(
	id: string,
	phoneNumber: string
): TelnyxSystemNumber {
	return {
		providerNumberId: id,
		phoneNumber,
		status: "active",
		country: "US",
		phoneNumberType: "local",
		connectionId: "voice-app-1",
		tags: [SYSTEM_NUMBER_POOL_TAG],
		deletionLockEnabled: true,
		voiceCapable: true,
		callForwardingEnabled: false,
		cnamListingEnabled: false,
		callerIdNameEnabled: false,
		callRecordingEnabled: false,
		inboundCallScreening: "flag_calls",
		customerReference: null
	};
}

function readyVoiceSettings(): TelnyxSystemNumberVoiceSettings {
	return {
		connectionId: "voice-app-1",
		translatedNumber: null,
		callForwardingEnabled: false,
		forwardingDestination: null,
		cnamListingEnabled: false,
		callerIdNameEnabled: false,
		inboundCallRecordingEnabled: false,
		inboundCallScreening: "flag_calls",
		voicemailEnabled: false
	};
}

function providerPayload(id: string, phoneNumber: string) {
	return {
		id,
		phone_number: phoneNumber,
		status: "active",
		country_iso_alpha2: "US",
		phone_number_type: "local",
		connection_id: "voice-app-1",
		features: [{ name: "voice" }],
		tags: [SYSTEM_NUMBER_POOL_TAG],
		deletion_lock_enabled: true,
		call_forwarding_enabled: false,
		cnam_listing_enabled: false,
		caller_id_name_enabled: false,
		call_recording_enabled: false,
		inbound_call_screening: "flag_calls"
	};
}

function voicePayload(overrides: Record<string, unknown> = {}) {
	return {
		connection_id: "voice-app-1",
		translated_number: null,
		caller_id_name_enabled: false,
		call_forwarding: { call_forwarding_enabled: false },
		cnam_listing: { cnam_listing_enabled: false },
		call_recording: { inbound_call_recording_enabled: false },
		inbound_call_screening: "flag_calls",
		voicemail_enabled: false,
		...overrides
	};
}

describe("System Number provider lifecycle", () => {
	beforeAll(ensureTestSchema);
	beforeEach(async () => {
		await env.nomorescamcalls_db.prepare("DELETE FROM system_numbers").run();
		await env.nomorescamcalls_db.prepare("DELETE FROM system_number_replenishments").run();
	});
	afterEach(() => vi.unstubAllGlobals());

	it("requires every approved provider condition for READY", () => {
		const invalid = readyProviderNumber("provider-1", "+19135550001");
		invalid.deletionLockEnabled = false;
		invalid.tags = [];
		const voice = readyVoiceSettings();
		voice.inboundCallScreening = "reject_calls";

		expect(evaluateSystemNumberReadiness(
			invalid,
			voice,
			"voice-app-1"
		)).toEqual({
			verified: false,
			reasons: [
				"provider_inbound_screening_not_flag_calls",
				"provider_deletion_lock_not_enabled",
				"provider_pool_tag_missing"
			]
		});
	});

	it("promotes only an independently verified provider number", async () => {
		await registerQuarantinedSystemNumber(env.nomorescamcalls_db, {
			providerNumberId: "provider-1",
			phoneNumber: "+19135550001"
		});
		vi.stubGlobal("fetch", vi.fn(async (url: string | URL | Request) => {
			const path = new URL(String(url)).pathname;
			if (path.endsWith("/voice")) {
				return new Response(JSON.stringify({ data: voicePayload() }));
			}
			if (path.endsWith("/voicemail")) {
				return new Response(JSON.stringify({ data: { enabled: false } }));
			}
			if (path.endsWith("/numbers_features")) {
				return new Response(JSON.stringify({
					data: [{ phone_number: "+19135550001", features: ["voice"] }]
				}));
			}
			if (path.endsWith("/provider-1")) {
				return new Response(JSON.stringify({
					data: providerPayload("provider-1", "+19135550001")
				}));
			}
			return new Response(JSON.stringify({
				data: [],
				meta: { page_number: 1, total_pages: 1 }
			}));
		}));

		await expect(reconcileSystemNumbers(
			env.nomorescamcalls_db,
			providerConfig
		)).resolves.toMatchObject({ verified: 1, failed: 0 });
		await expect(findSystemNumber(
			env.nomorescamcalls_db,
			"+19135550001"
		)).resolves.toMatchObject({
			lifecycleState: "ready",
			verificationState: "verified",
			quarantineReason: null
		});
	});

	it("keeps a provider-verification failure quarantined", async () => {
		await registerQuarantinedSystemNumber(env.nomorescamcalls_db, {
			providerNumberId: "provider-2",
			phoneNumber: "+19135550002"
		});
		vi.stubGlobal("fetch", vi.fn(async (url: string | URL | Request) => {
			const path = new URL(String(url)).pathname;
			if (path.endsWith("/voice")) {
				return new Response(JSON.stringify({
					data: voicePayload({ inbound_call_screening: "reject_calls" })
				}));
			}
			if (path.endsWith("/voicemail")) {
				return new Response(JSON.stringify({ data: { enabled: false } }));
			}
			if (path.endsWith("/numbers_features")) {
				return new Response(JSON.stringify({
					data: [{ phone_number: "+19135550002", features: ["voice"] }]
				}));
			}
			if (path.endsWith("/provider-2")) {
				return new Response(JSON.stringify({
					data: providerPayload("provider-2", "+19135550002")
				}));
			}
			return new Response(JSON.stringify({
				data: [],
				meta: { page_number: 1, total_pages: 1 }
			}));
		}));

		await expect(reconcileSystemNumbers(
			env.nomorescamcalls_db,
			providerConfig
		)).resolves.toMatchObject({ verified: 0, quarantined: 1, failed: 1 });
		await expect(findSystemNumber(
			env.nomorescamcalls_db,
			"+19135550002"
		)).resolves.toMatchObject({
			lifecycleState: "quarantined",
			verificationState: "failed",
			verificationError: "provider_inbound_screening_not_flag_calls"
		});
	});

	it("does not mutate inventory when a later provider page is unavailable", async () => {
		await addReadySystemNumber("+19135550003");
		const request = vi.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify({
				data: [providerPayload("other-provider", "+19135550004")],
				meta: { page_number: 1, total_pages: 2 }
			})))
			.mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
		vi.stubGlobal("fetch", request);

		await expect(reconcileSystemNumbers(
			env.nomorescamcalls_db,
			providerConfig
		)).rejects.toThrow("page 2 returned 503");
		await expect(findSystemNumber(
			env.nomorescamcalls_db,
			"+19135550003"
		)).resolves.toMatchObject({ lifecycleState: "ready" });
		await expect(findSystemNumber(
			env.nomorescamcalls_db,
			"+19135550004"
		)).resolves.toBeNull();
	});

	it("preserves the working test number without provider mutation or promotion", async () => {
		await env.nomorescamcalls_db.prepare(`
			INSERT INTO system_numbers (
				provider_number_id,
				phone_number,
				lifecycle_state,
				verification_state,
				quarantine_reason
			)
			VALUES ('working-test-provider', ?, 'quarantined', 'pending', 'working_test_number')
		`).bind(WORKING_TEST_SYSTEM_NUMBER).run();
		const request = vi.fn(async () => new Response(JSON.stringify({
			data: [],
			meta: { page_number: 1, total_pages: 1 }
		})));
		vi.stubGlobal("fetch", request);

		await reconcileSystemNumbers(env.nomorescamcalls_db, providerConfig);

		expect(request).toHaveBeenCalledTimes(1);
		await expect(findSystemNumber(
			env.nomorescamcalls_db,
			WORKING_TEST_SYSTEM_NUMBER
		)).resolves.toMatchObject({
			lifecycleState: "quarantined",
			verificationState: "pending",
			quarantineReason: "working_test_number"
		});
	});

	it("does not reorder while 6 verified READY numbers remain", async () => {
		for (let index = 0; index < 6; index += 1) {
			await addReadySystemNumber(`+19135551${index.toString().padStart(3, "0")}`);
		}
		const request = vi.fn();
		vi.stubGlobal("fetch", request);

		await expect(maintainSystemNumberPool(
			env.nomorescamcalls_db,
			providerConfig,
			"six-ready"
		)).resolves.toMatchObject({ action: "not_required" });
		expect(request).not.toHaveBeenCalled();
	});

	it("submits exactly one 50-number reorder when 5 verified READY numbers remain", async () => {
		for (let index = 0; index < 5; index += 1) {
			await addReadySystemNumber(`+19135552${index.toString().padStart(3, "0")}`);
		}
		const request = vi.fn(async () => new Response(JSON.stringify({
			data: {
				id: "order-5",
				ordering_groups: [{ status: "pending", count_allocated: 0 }]
			}
		})));
		vi.stubGlobal("fetch", request);

		await expect(maintainSystemNumberPool(
			env.nomorescamcalls_db,
			providerConfig,
			"five-ready"
		)).resolves.toMatchObject({
			action: "advanced",
			reason: "provider_order_submitted",
			replenishment: { requestedQuantity: 50, readyCountAtTrigger: 5 }
		});
		expect(request).toHaveBeenCalledTimes(1);
	});

	it("serializes concurrent threshold checks into one provider order", async () => {
		for (let index = 0; index < 5; index += 1) {
			await addReadySystemNumber(`+19135553${index.toString().padStart(3, "0")}`);
		}
		const request = vi.fn(async () => new Response(JSON.stringify({
			data: {
				id: "single-order",
				ordering_groups: [{ status: "pending", count_allocated: 0 }]
			}
		})));
		vi.stubGlobal("fetch", request);

		await Promise.all([
			maintainSystemNumberPool(env.nomorescamcalls_db, providerConfig, "concurrent-a"),
			maintainSystemNumberPool(env.nomorescamcalls_db, providerConfig, "concurrent-b")
		]);

		expect(request).toHaveBeenCalledTimes(1);
		const rows = await env.nomorescamcalls_db.prepare(`
			SELECT COUNT(*) AS count
			FROM system_number_replenishments
		`).first<{ count: number }>();
		expect(rows?.count).toBe(1);
	});

	it("does not count quarantined numbers toward the threshold", async () => {
		for (let index = 0; index < 5; index += 1) {
			await addReadySystemNumber(`+19135554${index.toString().padStart(3, "0")}`);
		}
		await registerQuarantinedSystemNumber(env.nomorescamcalls_db, {
			providerNumberId: "pending-provider",
			phoneNumber: "+19135554999"
		});
		const request = vi.fn(async () => new Response(JSON.stringify({
			data: {
				id: "order-with-quarantine",
				ordering_groups: [{ status: "pending", count_allocated: 0 }]
			}
		})));
		vi.stubGlobal("fetch", request);

		await maintainSystemNumberPool(
			env.nomorescamcalls_db,
			providerConfig,
			"quarantine-does-not-count"
		);

		expect(request).toHaveBeenCalledTimes(1);
	});
});
