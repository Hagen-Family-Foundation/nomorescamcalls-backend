import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, it, expect } from "vitest";

async function ensureTestSchema(): Promise<void> {
	await env.nomorescamcalls_db
		.prepare(`
			CREATE TABLE IF NOT EXISTS users (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				full_name TEXT,
				email TEXT UNIQUE,
				phone_number TEXT NOT NULL UNIQUE,
				screening_number TEXT UNIQUE,
				sip_username TEXT UNIQUE,
				status TEXT NOT NULL DEFAULT 'active',
				coverage_status TEXT NOT NULL DEFAULT 'active',
				created_at TEXT DEFAULT CURRENT_TIMESTAMP
			)
		`)
		.run();

	await env.nomorescamcalls_db
		.prepare(`
			CREATE TABLE IF NOT EXISTS block_list (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id INTEGER,
				phone_number TEXT NOT NULL,
				reason TEXT NOT NULL,
				created_at TEXT DEFAULT CURRENT_TIMESTAMP,
				UNIQUE(user_id, phone_number)
			)
		`)
		.run();

	await env.nomorescamcalls_db
		.prepare(`
			CREATE TABLE IF NOT EXISTS allow_list (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id INTEGER,
				phone_number TEXT NOT NULL,
				reason TEXT NOT NULL,
				created_at TEXT DEFAULT CURRENT_TIMESTAMP,
				UNIQUE(user_id, phone_number)
			)
		`)
		.run();

	await env.nomorescamcalls_db
		.prepare(`
			CREATE TABLE IF NOT EXISTS caller_reputation (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				caller_hash TEXT NOT NULL UNIQUE,
				status TEXT NOT NULL DEFAULT 'unknown',
				risk_score INTEGER NOT NULL DEFAULT 0,
				attempt_count INTEGER NOT NULL DEFAULT 1,
				first_seen TEXT DEFAULT CURRENT_TIMESTAMP,
				last_seen TEXT DEFAULT CURRENT_TIMESTAMP
			)
		`)
		.run();

	await env.nomorescamcalls_db
		.prepare(`
			CREATE TABLE IF NOT EXISTS confirmed_scam_numbers (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				caller_number TEXT NOT NULL UNIQUE,
				reason TEXT NOT NULL,
				evidence_level TEXT NOT NULL DEFAULT 'high',
				risk_score INTEGER NOT NULL DEFAULT 95,
				attempt_count INTEGER NOT NULL DEFAULT 1,
				first_seen TEXT DEFAULT CURRENT_TIMESTAMP,
				last_seen TEXT DEFAULT CURRENT_TIMESTAMP
			)
		`)
		.run();

	await env.nomorescamcalls_db
		.prepare(`
			CREATE TABLE IF NOT EXISTS call_events (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id INTEGER,
				caller_hash TEXT NOT NULL,
				decision TEXT NOT NULL,
				score INTEGER NOT NULL,
				reason TEXT NOT NULL,
				created_at TEXT DEFAULT CURRENT_TIMESTAMP
			)
		`)
		.run();

	await env.nomorescamcalls_db
		.prepare(`
			CREATE TABLE IF NOT EXISTS scam_signals (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				caller_hash TEXT NOT NULL,
				signal_type TEXT NOT NULL,
				confidence REAL NOT NULL DEFAULT 1.0,
				source TEXT NOT NULL DEFAULT 'system',
				created_at TEXT DEFAULT CURRENT_TIMESTAMP
			)
		`)
		.run();

	await env.nomorescamcalls_db
		.prepare(`
			CREATE TABLE IF NOT EXISTS telnyx_challenges (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id INTEGER,
				call_session_id TEXT NOT NULL UNIQUE,
				call_control_id TEXT NOT NULL,
				expected_input TEXT NOT NULL,
				status TEXT NOT NULL DEFAULT 'pending',
				created_at TEXT DEFAULT CURRENT_TIMESTAMP,
				updated_at TEXT DEFAULT CURRENT_TIMESTAMP
			)
		`)
		.run();

	await env.nomorescamcalls_db
		.prepare(`
			CREATE TABLE IF NOT EXISTS telnyx_webhook_events (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				event_type TEXT NOT NULL,
				call_control_id TEXT,
				call_session_id TEXT,
				caller_hash TEXT,
				from_number_hash TEXT,
				to_number TEXT,
				planned_action TEXT,
				planned_command TEXT,
				approved_sip_username TEXT,
				created_at TEXT DEFAULT CURRENT_TIMESTAMP
			)
		`)
		.run();


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

	await env.nomorescamcalls_db
		.prepare(`
			CREATE TABLE IF NOT EXISTS sip_credential_inventory (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				sip_username TEXT NOT NULL UNIQUE,
				status TEXT NOT NULL DEFAULT 'available',
				assigned_user_id INTEGER,
				assigned_at TEXT,
				provider TEXT NOT NULL DEFAULT 'telnyx',
				provider_credential_id TEXT,
				connection_id TEXT,
				last_synced_at TEXT,
				created_at TEXT DEFAULT CURRENT_TIMESTAMP
			)
		`)
		.run();

	await env.nomorescamcalls_db
		.prepare(`
			CREATE INDEX IF NOT EXISTS idx_screening_number_inventory_status
			ON screening_number_inventory(status)
		`)
		.run();

	await env.nomorescamcalls_db
		.prepare(`
			CREATE INDEX IF NOT EXISTS idx_screening_number_inventory_provider
			ON screening_number_inventory(provider)
		`)
		.run();

	await env.nomorescamcalls_db
		.prepare(`
			CREATE INDEX IF NOT EXISTS idx_screening_number_inventory_provider_number_id
			ON screening_number_inventory(provider_number_id)
		`)
		.run();
}

describe("NoMoreScamCalls Worker", () => {
	beforeAll(async () => {
		await ensureTestSchema();
	});

	it("returns health status", async () => {
		const response = await SELF.fetch("http://example.com/");

		expect(response.status).toBe(200);

		const body = await response.json<{
			service: string;
			status: string;
			version: string;
		}>();

		expect(body.service).toBe("nomorescamcalls");
		expect(body.status).toBe("ok");
		expect(body.version).toBe("0.1.0");
	});

	it("handles a simulated Telnyx initiated call webhook without live execution", async () => {
		const response = await SELF.fetch("http://example.com/webhooks/telnyx", {
			method: "POST",
			headers: {
				"content-type": "application/json"
			},
			body: JSON.stringify({
				data: {
					event_type: "call.initiated",
					payload: {
						call_control_id: "test-call-control-id",
						call_session_id: "test-call-session-id",
						from: "+18165551234",
						to: "+18165550000"
					}
				}
			})
		});

		expect(response.status).toBe(200);

		const body = await response.json<{
			received: boolean;
			screened: boolean;
			telnyxEvent: {
				eventType: string;
				callControlId: string;
				callSessionId: string;
				from: string;
				to: string;
			};
			plannedTelnyxAction: {
				mode: string;
				action: string;
			};
			plannedTelnyxCommand: {
				mode: string;
				command: string;
			};
			simulatedTelnyxRequest: {
				mode: string;
				method: string;
				endpoint: string;
				body: {
					destinationType?: string;
					destination?: string | null;
					routingReason?: string;
				};
			} | null;
			telnyxExecution: {
				mode: string;
				executed: boolean;
			};
		}>();

		expect(body.received).toBe(true);
		expect(body.screened).toBe(true);
		expect(body.telnyxEvent.eventType).toBe("call.initiated");
		expect(body.telnyxEvent.callControlId).toBe("test-call-control-id");
		expect(body.plannedTelnyxAction.mode).toBe("simulated");
		expect(body.plannedTelnyxCommand.mode).toBe("simulated");
		expect(body.telnyxExecution.mode).toBe("disabled");
		expect(body.telnyxExecution.executed).toBe(false);
	});
	it("adds and lists allow-list entries", async () => {
		const addResponse = await SELF.fetch("http://example.com/allow-list/add", {
			method: "POST",
			headers: {
				"content-type": "application/json"
			},
			body: JSON.stringify({
				phoneNumber: "+18165550100",
				reason: "family_member"
			})
		});

		expect(addResponse.status).toBe(200);

		const addBody = await addResponse.json<{
			added: boolean;
			list: string;
			phoneNumber: string;
			reason: string;
		}>();

		expect(addBody.added).toBe(true);
		expect(addBody.list).toBe("allow");
		expect(addBody.phoneNumber).toBe("+18165550100");
		expect(addBody.reason).toBe("family_member");

		const listResponse = await SELF.fetch("http://example.com/allow-list?limit=5");

		expect(listResponse.status).toBe(200);

		const listBody = await listResponse.json<{
			entries: Array<{
				phone_number: string;
				reason: string;
			}>;
		}>();

		expect(Array.isArray(listBody.entries)).toBe(true);
		expect(listBody.entries.some((entry) => entry.phone_number === "+18165550100")).toBe(true);
	});

	it("adds, lists, and removes block-list entries", async () => {
		const addResponse = await SELF.fetch("http://example.com/block-list/add", {
			method: "POST",
			headers: {
				"content-type": "application/json"
			},
			body: JSON.stringify({
				phoneNumber: "+18165550200",
				reason: "unwanted_business"
			})
		});

		expect(addResponse.status).toBe(200);

		const listResponse = await SELF.fetch("http://example.com/block-list?limit=5");

		expect(listResponse.status).toBe(200);

		const listBody = await listResponse.json<{
			entries: Array<{
				phone_number: string;
				reason: string;
			}>;
		}>();

		expect(listBody.entries.some((entry) => entry.phone_number === "+18165550200")).toBe(true);

		const removeResponse = await SELF.fetch("http://example.com/block-list/remove", {
			method: "POST",
			headers: {
				"content-type": "application/json"
			},
			body: JSON.stringify({
				phoneNumber: "+18165550200"
			})
		});

		expect(removeResponse.status).toBe(200);

		const removeBody = await removeResponse.json<{
			removed: boolean;
			list: string;
			phoneNumber: string;
		}>();

		expect(removeBody.removed).toBe(true);
		expect(removeBody.list).toBe("block");
		expect(removeBody.phoneNumber).toBe("+18165550200");
	});

	it("returns caller intelligence", async () => {
		const response = await SELF.fetch("http://example.com/caller?phone=%2B18165551234");

		expect(response.status).toBe(200);

		const body = await response.json<{
			caller: {
				phoneNumber: string;
				callerHash: string;
				confirmedScam: unknown;
				reputation: unknown;
				signals: unknown[];
				recentCalls: unknown[];
			};
		}>();

		expect(body.caller.phoneNumber).toBe("+18165551234");
		expect(typeof body.caller.callerHash).toBe("string");
		expect(Array.isArray(body.caller.signals)).toBe(true);
		expect(Array.isArray(body.caller.recentCalls)).toBe(true);
	});

	it("manually promotes a confirmed scam number", async () => {
		const response = await SELF.fetch("http://example.com/confirmed-scams/promote", {
			method: "POST",
			headers: {
				"content-type": "application/json"
			},
			body: JSON.stringify({
				phoneNumber: "+18165559999",
				reason: "manual_admin_review",
				riskScore: 95
			})
		});

		expect(response.status).toBe(200);

		const body = await response.json<{
			promoted: boolean;
			phoneNumber: string;
			reason: string;
			riskScore: number;
		}>();

		expect(body.promoted).toBe(true);
		expect(body.phoneNumber).toBe("+18165559999");
		expect(body.reason).toBe("manual_admin_review");
		expect(body.riskScore).toBe(95);
	});

	it("removes a confirmed scam number", async () => {
		await SELF.fetch("http://example.com/confirmed-scams/promote", {
			method: "POST",
			headers: {
				"content-type": "application/json"
			},
			body: JSON.stringify({
				phoneNumber: "+18165558888",
				reason: "manual_admin_review",
				riskScore: 95
			})
		});

		const response = await SELF.fetch("http://example.com/confirmed-scams/remove", {
			method: "POST",
			headers: {
				"content-type": "application/json"
			},
			body: JSON.stringify({
				phoneNumber: "+18165558888"
			})
		});

		expect(response.status).toBe(200);

		const body = await response.json<{
			removed: boolean;
			phoneNumber: string;
		}>();

		expect(body.removed).toBe(true);
		expect(body.phoneNumber).toBe("+18165558888");
	});

	it("returns confirmed scam numbers", async () => {
		const response = await SELF.fetch("http://example.com/confirmed-scams?limit=5");

		expect(response.status).toBe(200);

		const body = await response.json<{
			numbers: Array<{
				caller_number: string;
				reason: string;
				evidence_level: string;
				risk_score: number;
				attempt_count: number;
			}>;
		}>();

		expect(Array.isArray(body.numbers)).toBe(true);
	});

	it("returns screening number inventory health", async () => {
		const response = await SELF.fetch("http://example.com/inventory/screening-numbers/health?threshold=5");

		expect(response.status).toBe(200);

		const body = await response.json<{
			health: {
				total: number;
				available: number;
				assigned: number;
				lowInventoryThreshold: number;
				status: string;
			};
		}>();

		expect(body.health.total).toBeGreaterThanOrEqual(0);
		expect(body.health.lowInventoryThreshold).toBe(5);
		expect(["healthy", "low_inventory", "empty"]).toContain(body.health.status);
	});

	it("syncs Telnyx inventory from the configured Telnyx account", async () => {
		const response = await SELF.fetch("http://example.com/telnyx/inventory/sync", {
			method: "POST",
			headers: {
				"content-type": "application/json"
			},
			body: JSON.stringify({})
		});

		expect(response.status).toBe(200);

		const body = await response.json<{
			sync: {
				mode: string;
				source: string;
				importedCount: number;
				numbers: string[];
				reason: string;
			};
		}>();

		expect(body.sync.mode).toBe("simulated");
		expect(body.sync.source).toBe("telnyx_account");
		expect(body.sync.importedCount).toBe(0);
		expect(body.sync.numbers).toEqual([]);
		expect(body.sync.reason).toContain("TELNYX_API_KEY");
	});


	it("returns SIP credential inventory health", async () => {
		const response = await SELF.fetch("http://example.com/inventory/sip-credentials/health?threshold=5");

		expect(response.status).toBe(200);

		const body = await response.json<{
			health: {
				total: number;
				available: number;
				assigned: number;
				lowInventoryThreshold: number;
				status: string;
			};
		}>();

		expect(body.health.total).toBeGreaterThanOrEqual(0);
		expect(body.health.lowInventoryThreshold).toBe(5);
		expect(["healthy", "low_inventory", "empty"]).toContain(body.health.status);
	});

	it("syncs Telnyx SIP credentials from the configured Telnyx account", async () => {
		const response = await SELF.fetch("http://example.com/telnyx/sip-credentials/sync", {
			method: "POST",
			headers: {
				"content-type": "application/json"
			},
			body: JSON.stringify({})
		});

		expect(response.status).toBe(200);

		const body = await response.json<{
			sync: {
				mode: string;
				source: string;
				importedCount: number;
				sipUsernames: string[];
				reason: string;
			};
		}>();

		expect(body.sync.mode).toBe("simulated");
		expect(body.sync.source).toBe("telnyx_credential_connections");
		expect(body.sync.importedCount).toBe(0);
		expect(body.sync.sipUsernames).toEqual([]);
		expect(body.sync.reason).toContain("TELNYX_API_KEY");
	});

	it("provisions a subscriber with active coverage", async () => {
		await env.nomorescamcalls_db
			.prepare(`
				INSERT INTO screening_number_inventory (phone_number, status)
				VALUES (?, 'available')
				ON CONFLICT(phone_number) DO UPDATE SET
					status = 'available',
					assigned_user_id = NULL,
					assigned_at = NULL
			`)
			.bind("+19139562000")
			.run();

		await env.nomorescamcalls_db
			.prepare(`
				INSERT INTO sip_credential_inventory (sip_username, status)
				VALUES (?, 'available')
				ON CONFLICT(sip_username) DO UPDATE SET
					status = 'available',
					assigned_user_id = NULL,
					assigned_at = NULL
			`)
			.bind("usersupport15892")
			.run();

		const response = await SELF.fetch("http://example.com/provisioning/subscribers", {
			method: "POST",
			headers: {
				"content-type": "application/json"
			},
			body: JSON.stringify({
				fullName: "Mary Example",
				email: "mary@example.com",
				phoneNumber: "+18165550100"
			})
		});

		expect(response.status).toBe(200);

		const body = await response.json<{
			provisioning: {
				coverageStatus: string;
				provisioningStatus: string;
				user: {
					fullName: string;
					email: string;
					phoneNumber: string;
					screeningNumber: string;
					sipUsername: string;
					status: string;
					coverageStatus: string;
				};
				steps: Array<{
					name: string;
					status: string;
				}>;
			};
		}>();

		expect(body.provisioning.provisioningStatus).toBe("active");
		expect(body.provisioning.coverageStatus).toBe("active");
		expect(body.provisioning.user.fullName).toBe("Mary Example");
		expect(body.provisioning.user.email).toBe("mary@example.com");
		expect(body.provisioning.user.phoneNumber).toBe("+18165550100");
		expect(body.provisioning.user.screeningNumber).toBe("+19139562000");
		expect(body.provisioning.user.sipUsername).toBe("usersupport15892");
		expect(body.provisioning.user.status).toBe("active");
		expect(body.provisioning.user.coverageStatus).toBe("active");
		expect(body.provisioning.steps.map((step) => step.name)).toContain("screening_number_reserved_from_inventory");
		expect(body.provisioning.steps.map((step) => step.name)).toContain("sip_username_assigned");
		expect(body.provisioning.steps.map((step) => step.name)).toContain("coverage_activated");
	});


	it("does not leave partial provisioning state when SIP inventory is unavailable", async () => {
		await env.nomorescamcalls_db
			.prepare(`
				INSERT INTO screening_number_inventory (phone_number, status)
				VALUES (?, 'available')
				ON CONFLICT(phone_number) DO UPDATE SET
					status = 'available',
					assigned_user_id = NULL,
					assigned_at = NULL
			`)
			.bind("+19139562001")
			.run();

		await env.nomorescamcalls_db
			.prepare("DELETE FROM sip_credential_inventory")
			.run();

		const response = await SELF.fetch("http://example.com/provisioning/subscribers", {
			method: "POST",
			headers: {
				"content-type": "application/json"
			},
			body: JSON.stringify({
				fullName: "Failed Provisioning Test",
				email: "failed-provisioning@example.com",
				phoneNumber: "+18165550101"
			})
		});

		expect(response.status).toBe(409);

		const body = await response.json<{
			error: string;
			reason: string;
		}>();

		expect(body.error).toBe("Provisioning failed");
		expect(body.reason).toBe("No available SIP credentials");

		const user = await env.nomorescamcalls_db
			.prepare("SELECT id FROM users WHERE phone_number = ?")
			.bind("+18165550101")
			.first();

		expect(user).toBeNull();

		const screeningNumber = await env.nomorescamcalls_db
			.prepare(`
				SELECT status, assigned_user_id, assigned_at
				FROM screening_number_inventory
				WHERE phone_number = ?
			`)
			.bind("+19139562001")
			.first<{
				status: string;
				assigned_user_id: number | null;
				assigned_at: string | null;
			}>();

		expect(screeningNumber?.status).toBe("available");
		expect(screeningNumber?.assigned_user_id).toBeNull();
		expect(screeningNumber?.assigned_at).toBeNull();
	});

	it("creates and lists user routing records", async () => {
		const createResponse = await SELF.fetch("http://example.com/users", {
			method: "POST",
			headers: {
				"content-type": "application/json"
			},
			body: JSON.stringify({
				phoneNumber: "+18165550002",
				screeningNumber: "+18165550003",
				sipUsername: "user_18165550002",
				status: "active"
			})
		});

		expect(createResponse.status).toBe(200);

		const createBody = await createResponse.json<{
			user: {
				phoneNumber: string;
				screeningNumber: string;
				sipUsername: string;
				status: string;
			};
		}>();

		expect(createBody.user.phoneNumber).toBe("+18165550002");
		expect(createBody.user.screeningNumber).toBe("+18165550003");
		expect(createBody.user.sipUsername).toBe("user_18165550002");
		expect(createBody.user.status).toBe("active");

		const listResponse = await SELF.fetch("http://example.com/users?limit=10");

		expect(listResponse.status).toBe(200);

		const listBody = await listResponse.json<{
			users: Array<{
				phoneNumber: string;
				screeningNumber: string | null;
				sipUsername: string | null;
				status: string;
			}>;
		}>();

		expect(listBody.users.some((user) => user.phoneNumber === "+18165550002")).toBe(true);
	});

	it("resolves protected user from Telnyx destination number", async () => {
		await env.nomorescamcalls_db
			.prepare(`
				INSERT INTO users (
					phone_number,
					screening_number,
					sip_username,
					status
				)
				VALUES (?, ?, ?, 'active')
				ON CONFLICT(phone_number) DO UPDATE SET
					screening_number = excluded.screening_number,
					sip_username = excluded.sip_username,
					status = 'active'
			`)
			.bind(
				"+18165550001",
				"+18165550000",
				"user_18165550001"
			)
			.run();

		const response = await SELF.fetch("http://example.com/webhooks/telnyx", {
			method: "POST",
			headers: {
				"content-type": "application/json"
			},
			body: JSON.stringify({
				data: {
					event_type: "call.initiated",
					payload: {
						call_control_id: "test-user-call-control-id",
						call_session_id: "test-user-call-session-id",
						from: "+18165551235",
						to: "+18165550000"
					}
				}
			})
		});

		expect(response.status).toBe(200);

		const body = await response.json<{
			protectedUser: {
				id: number;
				phoneNumber: string;
				screeningNumber: string;
				sipUsername: string;
				status: string;
			} | null;
			approvedDestination: {
				destinationType: string;
				destination: string | null;
			};
			simulatedTelnyxRequest: {
				body: {
					destinationType?: string;
					sipUsername?: string | null;
					simulatedDestination?: string | null;
					liveApiReady?: boolean;
				};
			} | null;
		}>();

		expect(body.protectedUser).not.toBeNull();
		expect(body.protectedUser?.phoneNumber).toBe("+18165550001");
		expect(body.protectedUser?.screeningNumber).toBe("+18165550000");
		expect(body.protectedUser?.sipUsername).toBe("user_18165550001");
		expect(body.protectedUser?.status).toBe("active");
		expect(body.approvedDestination.destinationType).toBe("app");
		expect(body.approvedDestination.destination).toBe("user_18165550001");
		expect(body.simulatedTelnyxRequest?.body.destinationType).toBe("app");
		expect(body.simulatedTelnyxRequest?.body.sipUsername).toBe("user_18165550001");
		expect(body.simulatedTelnyxRequest?.body.to).toBe("sip:user_18165550001@sip.telnyx.com");
		expect(body.simulatedTelnyxRequest?.body.liveApiReady).toBe(true);
		expect(body.simulatedTelnyxRequest?.body.from).toBe("+18165550000");
	});

	it("handles a Telnyx challenge response webhook", async () => {
		const response = await SELF.fetch("http://example.com/webhooks/telnyx", {
			method: "POST",
			headers: {
				"content-type": "application/json"
			},
			body: JSON.stringify({
				data: {
					event_type: "call.gather.ended",
					payload: {
						call_control_id: "test-call-control-id",
						call_session_id: "test-call-session-id",
						from: "+18165551234",
						to: "+18165550000",
						digits: "5"
					}
				}
			})
		});

		expect(response.status).toBe(200);

		const body = await response.json<{
			received: boolean;
			challengeHandled: boolean;
			plannedChallengeOutcome: {
				outcome: string;
				nextCommand: string;
			};
			plannedTelnyxCommand: {
				command: string;
			};
			telnyxExecution: {
				executed: boolean;
			};
		}>();

		expect(body.received).toBe(true);
		expect(body.challengeHandled).toBe(true);
		expect(body.plannedChallengeOutcome.outcome).toBe("passed");
		expect(body.plannedChallengeOutcome.nextCommand).toBe("transfer");
		expect(body.plannedTelnyxCommand.command).toBe("transfer");
		expect(body.telnyxExecution.executed).toBe(false);
	});

	it("returns recent Telnyx audit events", async () => {
		const response = await SELF.fetch("http://example.com/audit/telnyx?limit=5");

		expect(response.status).toBe(200);

		const body = await response.json<{
			events: Array<{
				event_type: string;
				planned_action: string | null;
				planned_command: string | null;
			}>;
		}>();

		expect(Array.isArray(body.events)).toBe(true);
	});

});
