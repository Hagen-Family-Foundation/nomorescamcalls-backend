import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { syncTelnyxInventory } from "../src/services/telnyxInventorySync";
import { findScreeningNumberInInventory } from "../src/services/screeningNumberInventory";

async function ensureInventorySchema(): Promise<void> {
	await env.nomorescamcalls_db
		.prepare(`
			CREATE TABLE IF NOT EXISTS screening_number_inventory (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				phone_number TEXT NOT NULL UNIQUE,
				status TEXT NOT NULL DEFAULT 'available',
				assigned_user_id INTEGER,
				assigned_protected_line_id INTEGER,
				assigned_at TEXT,
				provider TEXT NOT NULL DEFAULT 'telnyx',
				provider_number_id TEXT,
				voice_application_id TEXT,
				connection_id TEXT,
				last_synced_at TEXT,
				created_at TEXT DEFAULT CURRENT_TIMESTAMP
			)
		`)
		.run();

	const columns = await env.nomorescamcalls_db
		.prepare("PRAGMA table_info(screening_number_inventory)")
		.all<{ name: string }>();
	if (!columns.results.some((column) => column.name === "assigned_protected_line_id")) {
		await env.nomorescamcalls_db
			.prepare("ALTER TABLE screening_number_inventory ADD COLUMN assigned_protected_line_id INTEGER")
			.run();
	}
}

describe("telnyxInventorySync", () => {
	beforeAll(async () => {
		await ensureInventorySchema();
	});

	it("stores Telnyx provider metadata while syncing inventory", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
			data: [
				{
					id: "telnyx-number-sync-1",
					phone_number: "+19139562222"
				}
			]
		}), {
			status: 200
		})));

		const result = await syncTelnyxInventory(
			env.nomorescamcalls_db,
			{
				telnyxConfig: {
					apiKey: "test-api-key",
					baseUrl: "https://api.telnyx.test/v2"
				},
				voiceApplicationId: "voice-app-default",
				connectionId: "connection-default"
			}
		);

		expect(result.mode).toBe("live");
		expect(result.source).toBe("telnyx_account");
		expect(result.importedCount).toBe(1);
		expect(result.numbers).toEqual(["+19139562222"]);

		const stored = await findScreeningNumberInInventory(
			env.nomorescamcalls_db,
			"+19139562222"
		);

		expect(stored?.provider).toBe("telnyx");
		expect(stored?.providerNumberId).toBe("telnyx-number-sync-1");
		expect(stored?.voiceApplicationId).toBe("voice-app-default");
		expect(stored?.connectionId).toBe("connection-default");
		expect(stored?.status).toBe("available");
		expect(stored?.lastSyncedAt).toBeTruthy();
	});
	it("does not reset assigned inventory back to available during sync", async () => {
		await env.nomorescamcalls_db
			.prepare(`
				INSERT INTO screening_number_inventory (
					phone_number,
					status,
					assigned_user_id,
					assigned_protected_line_id,
					assigned_at,
					provider
				)
				VALUES (?, 'assigned', 123, 456, CURRENT_TIMESTAMP, 'telnyx')
				ON CONFLICT(phone_number) DO UPDATE SET
					status = 'assigned',
					assigned_user_id = 123,
					assigned_protected_line_id = 456,
					assigned_at = CURRENT_TIMESTAMP
			`)
			.bind("+19139563333")
			.run();

		vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
			data: [
				{
					id: "telnyx-number-sync-assigned",
					phone_number: "+19139563333"
				}
			]
		}), {
			status: 200
		})));

		await syncTelnyxInventory(
			env.nomorescamcalls_db,
			{
				telnyxConfig: {
					apiKey: "test-api-key",
					baseUrl: "https://api.telnyx.test/v2"
				},
				voiceApplicationId: "voice-app-default",
				connectionId: "connection-default"
			}
		);

		const stored = await findScreeningNumberInInventory(
			env.nomorescamcalls_db,
			"+19139563333"
		);

		expect(stored?.status).toBe("assigned");
		expect(stored?.assignedUserId).toBe(123);
		expect(stored?.assignedProtectedLineId).toBe(456);
		expect(stored?.providerNumberId).toBe("telnyx-number-sync-assigned");
		expect(stored?.voiceApplicationId).toBe("voice-app-default");
		expect(stored?.connectionId).toBe("connection-default");
	});


	it("removes available Telnyx inventory numbers missing from the latest sync", async () => {
		await env.nomorescamcalls_db
			.prepare(`
				INSERT INTO screening_number_inventory (
					phone_number,
					status,
					provider
				)
				VALUES (?, 'available', 'telnyx')
				ON CONFLICT(phone_number) DO UPDATE SET
					status = 'available',
					assigned_user_id = NULL,
					assigned_protected_line_id = NULL,
					assigned_at = NULL,
					provider = 'telnyx'
			`)
			.bind("+18005550196")
			.run();

		vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
			data: [
				{
					id: "telnyx-number-still-active",
					phone_number: "+18005550195"
				}
			]
		}), {
			status: 200
		})));

		await syncTelnyxInventory(
			env.nomorescamcalls_db,
			{
				telnyxConfig: {
					apiKey: "test-api-key",
					baseUrl: "https://api.telnyx.test/v2"
				}
			}
		);

		const stale = await findScreeningNumberInInventory(
			env.nomorescamcalls_db,
			"+18005550196"
		);

		const active = await findScreeningNumberInInventory(
			env.nomorescamcalls_db,
			"+18005550195"
		);

		expect(stale).toBeNull();
		expect(active?.status).toBe("available");
	});

});
