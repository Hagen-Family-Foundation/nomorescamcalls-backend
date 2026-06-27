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
});
