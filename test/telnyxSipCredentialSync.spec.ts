import { beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "cloudflare:test";
import { findSipCredentialInInventory } from "../src/services/sipCredentialInventory";
import { syncTelnyxSipCredentials } from "../src/services/telnyxSipCredentialSync";

describe("syncTelnyxSipCredentials", () => {
	beforeEach(async () => {
		vi.restoreAllMocks();

		await env.nomorescamcalls_db
			.prepare(`
				CREATE TABLE IF NOT EXISTS sip_credential_inventory (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					sip_username TEXT NOT NULL UNIQUE,
					status TEXT NOT NULL DEFAULT 'available',
					assigned_user_id INTEGER,
					assigned_protected_line_id INTEGER,
					assigned_at TEXT,
					provider TEXT NOT NULL DEFAULT 'telnyx',
					provider_credential_id TEXT,
					connection_id TEXT,
					last_synced_at TEXT,
					created_at TEXT DEFAULT CURRENT_TIMESTAMP
				)
			`)
			.run();

		const columns = await env.nomorescamcalls_db
			.prepare("PRAGMA table_info(sip_credential_inventory)")
			.all<{ name: string }>();
		if (!columns.results.some((column) => column.name === "assigned_protected_line_id")) {
			await env.nomorescamcalls_db
				.prepare("ALTER TABLE sip_credential_inventory ADD COLUMN assigned_protected_line_id INTEGER")
				.run();
		}

		await env.nomorescamcalls_db
			.prepare("DELETE FROM sip_credential_inventory")
			.run();
	});

	it("syncs SIP credentials from Telnyx into inventory", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
			data: [
				{
					id: "credential-1",
					user_name: "test_user_support_15892",
					connection_id: "connection-1"
				},
				{
					id: "credential-1-duplicate",
					user_name: "test_user_support_15892",
					connection_id: "connection-1"
				}
			]
		}), {
			status: 200
		})));

		const result = await syncTelnyxSipCredentials(
			env.nomorescamcalls_db,
			{
				telnyxConfig: {
					apiKey: "test-api-key",
					baseUrl: "https://api.telnyx.test/v2"
				},
				connectionId: "connection-default"
			}
		);

		expect(result.mode).toBe("live");
		expect(result.importedCount).toBe(1);
		expect(result.sipUsernames).toEqual(["test_user_support_15892"]);

		const stored = await findSipCredentialInInventory(
			env.nomorescamcalls_db,
			"test_user_support_15892"
		);

		expect(stored?.status).toBe("available");
		expect(stored?.provider).toBe("telnyx");
		expect(stored?.providerCredentialId).toBe("credential-1");
		expect(stored?.connectionId).toBe("connection-1");
	});

	it("returns simulated mode when no API key is configured", async () => {
		const result = await syncTelnyxSipCredentials(
			env.nomorescamcalls_db,
			{
				telnyxConfig: {}
			}
		);

		expect(result.mode).toBe("simulated");
		expect(result.importedCount).toBe(0);
		expect(result.sipUsernames).toEqual([]);
	});
});
