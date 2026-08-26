import { beforeEach, describe, expect, it } from "vitest";
import {
	addSipCredentialToInventory,
	findSipCredentialInInventory,
	getSipCredentialInventoryHealth,
	reserveAvailableSipCredential
} from "../src/services/sipCredentialInventory";
import { env } from "cloudflare:test";

describe("SIP credential inventory", () => {
	beforeEach(async () => {
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

	it("adds and finds a SIP credential", async () => {
		const credential = await addSipCredentialToInventory(
			env.nomorescamcalls_db,
			{
				sipUsername: "test_user_support_15892",
				providerCredentialId: "credential-1",
				connectionId: "connection-1"
			}
		);

		expect(credential.sipUsername).toBe("test_user_support_15892");
		expect(credential.status).toBe("available");
		expect(credential.provider).toBe("telnyx");
		expect(credential.providerCredentialId).toBe("credential-1");
		expect(credential.connectionId).toBe("connection-1");

		const found = await findSipCredentialInInventory(
			env.nomorescamcalls_db,
			"test_user_support_15892"
		);

		expect(found?.sipUsername).toBe("test_user_support_15892");
	});

	it("reserves the first available SIP credential", async () => {
		await addSipCredentialToInventory(
			env.nomorescamcalls_db,
			"test_user_support_15892"
		);

		const reserved = await reserveAvailableSipCredential(
			env.nomorescamcalls_db,
			7,
			42
		);

		expect(reserved.sipUsername).toBe("test_user_support_15892");
		expect(reserved.status).toBe("assigned");
		expect(reserved.assignedUserId).toBe(42);
		expect(reserved.assignedProtectedLineId).toBe(7);
	});

	it("reports SIP credential inventory health", async () => {
		await addSipCredentialToInventory(
			env.nomorescamcalls_db,
			"test_user_support_15892"
		);

		const health = await getSipCredentialInventoryHealth(
			env.nomorescamcalls_db,
			5
		);

		expect(health.total).toBe(1);
		expect(health.available).toBe(1);
		expect(health.assigned).toBe(0);
		expect(health.status).toBe("low_inventory");
	});
});
