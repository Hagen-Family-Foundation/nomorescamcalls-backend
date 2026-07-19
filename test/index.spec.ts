import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, it, expect } from "vitest";

async function ensureTestSchema(): Promise<void> {
	await env.nomorescamcalls_db
		.prepare(`
			CREATE TABLE IF NOT EXISTS users (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				first_name TEXT,
				last_name TEXT,
				carrier TEXT,
				contact_method TEXT,
				password_hash TEXT,
				role TEXT NOT NULL DEFAULT 'participant',
				account_status TEXT NOT NULL DEFAULT 'active',
				setup_status TEXT NOT NULL DEFAULT 'account_created',
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
			CREATE TABLE IF NOT EXISTS beta_invite_codes (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				code TEXT NOT NULL UNIQUE,
				status TEXT NOT NULL DEFAULT 'active',
				expires_at TEXT,
				max_uses INTEGER NOT NULL DEFAULT 1,
				use_count INTEGER NOT NULL DEFAULT 0,
				created_by_user_id INTEGER,
				redeemed_by_user_id INTEGER,
				created_at TEXT DEFAULT CURRENT_TIMESTAMP,
				updated_at TEXT DEFAULT CURRENT_TIMESTAMP
			)
		`)
		.run();

	await env.nomorescamcalls_db
		.prepare(`
			CREATE TABLE IF NOT EXISTS portal_sessions (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id INTEGER NOT NULL,
				token_hash TEXT NOT NULL UNIQUE,
				expires_at TEXT NOT NULL,
				last_used_at TEXT,
				revoked_at TEXT,
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
						from: "+18005551234",
						to: "+18005550000"
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
		const response = await SELF.fetch("http://example.com/caller?phone=%2B18005551234");

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

		expect(body.caller.phoneNumber).toBe("+18005551234");
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
				firstName: "Mary",
				lastName: "Example",
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
					firstName: string;
					lastName: string;
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
		expect(body.provisioning.user.firstName).toBe("Mary");
		expect(body.provisioning.user.lastName).toBe("Example");
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
				firstName: "Failed Provisioning",
				lastName: "Test",
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
				"+18005550101",
				"+18005550000",
				"test_user_18005550101"
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
						from: "+18005551235",
						to: "+18005550000"
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
		expect(body.protectedUser?.phoneNumber).toBe("+18005550101");
		expect(body.protectedUser?.screeningNumber).toBe("+18005550000");
		expect(body.protectedUser?.sipUsername).toBe("test_user_18005550101");
		expect(body.protectedUser?.status).toBe("active");
		expect(body.approvedDestination.destinationType).toBe("app");
		expect(body.approvedDestination.destination).toBe("test_user_18005550101");
		expect(body.simulatedTelnyxRequest?.metadata.destinationType).toBe("app");
		expect(body.simulatedTelnyxRequest?.metadata.sipUsername).toBe("test_user_18005550101");
		expect(body.simulatedTelnyxRequest?.body.to).toBe("sip:test_user_18005550101@sip.telnyx.com");
		expect(body.simulatedTelnyxRequest?.metadata.liveApiReady).toBe(true);
		expect(body.simulatedTelnyxRequest?.body.from).toBe("+18005550000");
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
						from: "+18005551234",
						to: "+18005550000",
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

	it("registers a beta participant and associates the invite", async () => {
		await env.nomorescamcalls_db
			.prepare(`
				INSERT INTO beta_invite_codes (
					code,
					status,
					max_uses,
					use_count
				)
				VALUES (?, 'active', 1, 0)
				ON CONFLICT(code) DO UPDATE SET
					status = 'active',
					max_uses = 1,
					use_count = 0,
					expires_at = NULL,
					redeemed_by_user_id = NULL
			`)
			.bind("BETA-REGISTER-ONE")
			.run();

		const response = await SELF.fetch(
			"http://example.com/beta/register",
			{
				method: "POST",
				headers: {
					"content-type": "application/json"
				},
				body: JSON.stringify({
					code: "BETA-REGISTER-ONE",
					firstName: "Kelly",
					lastName: "Hagen",
					email: "kelly.beta@example.com",
					phoneNumber: "+15550001001",
					carrier: "Example Carrier",
					contactMethod: "email",
					password: "beta-password"
				})
			}
		);

		expect(response.status).toBe(201);

		const body = await response.json<{
			registered: boolean;
			registration: {
				inviteCode: string;
				user: {
					id: number;
					firstName: string;
					lastName: string;
					email: string;
					phoneNumber: string;
					carrier: string;
					contactMethod: string;
					role: string;
					accountStatus: string;
					setupStatus: string;
					coverageStatus: string;
				};
			};
		}>();

		expect(body.registered).toBe(true);
		expect(body.registration.inviteCode).toBe("BETA-REGISTER-ONE");
		expect(body.registration.user.firstName).toBe("Kelly");
		expect(body.registration.user.lastName).toBe("Hagen");
		expect(body.registration.user.email).toBe("kelly.beta@example.com");
		expect(body.registration.user.phoneNumber).toBe("+15550001001");
		expect(body.registration.user.carrier).toBe("Example Carrier");
		expect(body.registration.user.contactMethod).toBe("email");
		expect(body.registration.user.role).toBe("participant");
		expect(body.registration.user.accountStatus).toBe("active");
		expect(body.registration.user.setupStatus).toBe("account_created");
		expect(body.registration.user.coverageStatus).toBe("pending");

		const storedUser = await env.nomorescamcalls_db
			.prepare(`
				SELECT id, password_hash
				FROM users
				WHERE phone_number = ?
			`)
			.bind("+15550001001")
			.first<{
				id: number;
				password_hash: string;
			}>();

		expect(storedUser).not.toBeNull();
		expect(storedUser?.password_hash).not.toBe("beta-password");
		expect(storedUser?.password_hash.startsWith("pbkdf2_sha256$")).toBe(true);

		const storedInvite = await env.nomorescamcalls_db
			.prepare(`
				SELECT status, use_count, redeemed_by_user_id
				FROM beta_invite_codes
				WHERE code = ?
			`)
			.bind("BETA-REGISTER-ONE")
			.first<{
				status: string;
				use_count: number;
				redeemed_by_user_id: number | null;
			}>();

		expect(storedInvite?.status).toBe("used");
		expect(storedInvite?.use_count).toBe(1);
		expect(storedInvite?.redeemed_by_user_id).toBe(storedUser?.id);
	});

	it("rejects reuse of a registered beta invite", async () => {
		const response = await SELF.fetch(
			"http://example.com/beta/register",
			{
				method: "POST",
				headers: {
					"content-type": "application/json"
				},
				body: JSON.stringify({
					code: "BETA-REGISTER-ONE",
					firstName: "Second",
					lastName: "Participant",
					email: "second.beta@example.com",
					phoneNumber: "+15550001002",
					carrier: "Example Carrier",
					contactMethod: "email",
					password: "second-password"
				})
			}
		);

		expect(response.status).toBe(409);

		const secondUser = await env.nomorescamcalls_db
			.prepare(`
				SELECT id
				FROM users
				WHERE phone_number = ?
			`)
			.bind("+15550001002")
			.first();

		expect(secondUser).toBeNull();
	});

	it("rejects an expired beta invite during registration", async () => {
		await env.nomorescamcalls_db
			.prepare(`
				INSERT INTO beta_invite_codes (
					code,
					status,
					expires_at,
					max_uses,
					use_count
				)
				VALUES (?, 'active', ?, 1, 0)
				ON CONFLICT(code) DO UPDATE SET
					status = 'active',
					expires_at = excluded.expires_at,
					max_uses = 1,
					use_count = 0,
					redeemed_by_user_id = NULL
			`)
			.bind(
				"BETA-REGISTER-EXPIRED",
				"2020-01-01T00:00:00.000Z"
			)
			.run();

		const response = await SELF.fetch(
			"http://example.com/beta/register",
			{
				method: "POST",
				headers: {
					"content-type": "application/json"
				},
				body: JSON.stringify({
					code: "BETA-REGISTER-EXPIRED",
					firstName: "Expired",
					lastName: "Participant",
					email: "expired.beta@example.com",
					phoneNumber: "+15550001003",
					carrier: "Example Carrier",
					contactMethod: "email",
					password: "expired-password"
				})
			}
		);

		expect(response.status).toBe(409);
	});

	it("requires all beta registration fields", async () => {
		const response = await SELF.fetch(
			"http://example.com/beta/register",
			{
				method: "POST",
				headers: {
					"content-type": "application/json"
				},
				body: JSON.stringify({
					code: "BETA-INCOMPLETE"
				})
			}
		);

		expect(response.status).toBe(400);

		const body = await response.json<{
			error: string;
		}>();

		expect(body.error).toBe(
			"code, firstName, lastName, email, phoneNumber, carrier, contactMethod, and password are required"
		);
	});

	it("logs in a registered beta participant and creates a session", async () => {
		await env.nomorescamcalls_db
			.prepare(`
				INSERT INTO beta_invite_codes (
					code,
					status,
					max_uses,
					use_count
				)
				VALUES (?, 'active', 1, 0)
			`)
			.bind("BETA-LOGIN-ONE")
			.run();

		const registrationResponse = await SELF.fetch(
			"http://example.com/beta/register",
			{
				method: "POST",
				headers: {
					"content-type": "application/json"
				},
				body: JSON.stringify({
					code: "BETA-LOGIN-ONE",
					firstName: "Kelly",
					lastName: "Hagen",
					email: "kelly.beta@example.com",
					phoneNumber: "+15550001004",
					carrier: "Example Carrier",
					contactMethod: "email",
					password: "beta-password"
				})
			}
		);

		expect(registrationResponse.status).toBe(201);

		const response = await SELF.fetch(
			"http://example.com/beta/login",
			{
				method: "POST",
				headers: {
					"content-type": "application/json"
				},
				body: JSON.stringify({
					email: "KELLY.BETA@EXAMPLE.COM",
					password: "beta-password"
				})
			}
		);

		expect(response.status).toBe(200);

		const body = await response.json<{
			authenticated: boolean;
			login: {
				sessionToken: string;
				expiresAt: string;
				user: {
					id: number;
					email: string;
					role: string;
					accountStatus: string;
				};
			};
		}>();

		expect(body.authenticated).toBe(true);
		expect(body.login.sessionToken.length).toBeGreaterThan(20);
		expect(body.login.user.email).toBe("kelly.beta@example.com");
		expect(body.login.user.role).toBe("participant");
		expect(body.login.user.accountStatus).toBe("active");
		expect(
			new Date(body.login.expiresAt).getTime()
		).toBeGreaterThan(Date.now());

		const storedSession = await env.nomorescamcalls_db
			.prepare(`
				SELECT
					token_hash,
					expires_at,
					revoked_at
				FROM portal_sessions
				WHERE user_id = ?
				ORDER BY id DESC
				LIMIT 1
			`)
			.bind(body.login.user.id)
			.first<{
				token_hash: string;
				expires_at: string;
				revoked_at: string | null;
			}>();

		expect(storedSession).not.toBeNull();
		expect(storedSession?.token_hash).not.toBe(
			body.login.sessionToken
		);
		expect(storedSession?.token_hash).toMatch(
			/^[a-f0-9]{64}$/
		);
		expect(storedSession?.expires_at).toBe(
			body.login.expiresAt
		);
		expect(storedSession?.revoked_at).toBeNull();
	});

	it("rejects an incorrect beta participant password", async () => {
		const response = await SELF.fetch(
			"http://example.com/beta/login",
			{
				method: "POST",
				headers: {
					"content-type": "application/json"
				},
				body: JSON.stringify({
					email: "kelly.beta@example.com",
					password: "incorrect-password"
				})
			}
		);

		expect(response.status).toBe(401);

		const body = await response.json<{
			error: string;
		}>();

		expect(body.error).toBe("Invalid email or password");
	});

	it("rejects an unknown beta participant email", async () => {
		const response = await SELF.fetch(
			"http://example.com/beta/login",
			{
				method: "POST",
				headers: {
					"content-type": "application/json"
				},
				body: JSON.stringify({
					email: "unknown.beta@example.com",
					password: "beta-password"
				})
			}
		);

		expect(response.status).toBe(401);
	});

	it("requires beta login credentials", async () => {
		const response = await SELF.fetch(
			"http://example.com/beta/login",
			{
				method: "POST",
				headers: {
					"content-type": "application/json"
				},
				body: JSON.stringify({
					email: "kelly.beta@example.com"
				})
			}
		);

		expect(response.status).toBe(400);

		const body = await response.json<{
			error: string;
		}>();

		expect(body.error).toBe(
			"email and password are required"
		);
	});


	it("authenticates an active beta portal session", async () => {
		await env.nomorescamcalls_db
			.prepare(`
				INSERT INTO beta_invite_codes (
					code,
					status,
					max_uses,
					use_count
				)
				VALUES (?, 'active', 1, 0)
			`)
			.bind("BETA-SESSION-ACTIVE")
			.run();

		const registrationResponse = await SELF.fetch(
			"http://example.com/beta/register",
			{
				method: "POST",
				headers: {
					"content-type": "application/json"
				},
				body: JSON.stringify({
					code: "BETA-SESSION-ACTIVE",
					firstName: "Active",
					lastName: "Participant",
					email: "active.session@example.com",
					phoneNumber: "+15550001005",
					carrier: "Example Carrier",
					contactMethod: "email",
					password: "beta-password"
				})
			}
		);

		expect(registrationResponse.status).toBe(201);

		const loginResponse = await SELF.fetch(
			"http://example.com/beta/login",
			{
				method: "POST",
				headers: {
					"content-type": "application/json"
				},
				body: JSON.stringify({
					email: "active.session@example.com",
					password: "beta-password"
				})
			}
		);

		expect(loginResponse.status).toBe(200);

		const loginBody = await loginResponse.json<{
			login: {
				sessionToken: string;
				user: {
					id: number;
				};
			};
		}>();

		await env.nomorescamcalls_db
			.prepare(`
				UPDATE portal_sessions
				SET last_used_at = NULL
				WHERE user_id = ?
			`)
			.bind(loginBody.login.user.id)
			.run();

		const response = await SELF.fetch(
			"http://example.com/beta/session",
			{
				method: "GET",
				headers: {
					authorization: `Bearer ${loginBody.login.sessionToken}`
				}
			}
		);

		expect(response.status).toBe(200);

		const body = await response.json<{
			authenticated: boolean;
			session: {
				expiresAt: string;
				user: {
					id: number;
					email: string;
					role: string;
				};
			};
		}>();

		expect(body.authenticated).toBe(true);
		expect(body.session.user.id).toBe(loginBody.login.user.id);
		expect(body.session.user.email).toBe(
			"active.session@example.com"
		);
		expect(body.session.user.role).toBe("participant");

		const storedSession = await env.nomorescamcalls_db
			.prepare(`
				SELECT last_used_at
				FROM portal_sessions
				WHERE user_id = ?
				ORDER BY id DESC
				LIMIT 1
			`)
			.bind(loginBody.login.user.id)
			.first<{
				last_used_at: string | null;
			}>();

		expect(storedSession?.last_used_at).not.toBeNull();
	});

	it("rejects a missing beta portal session token", async () => {
		const response = await SELF.fetch(
			"http://example.com/beta/session"
		);

		expect(response.status).toBe(401);

		const body = await response.json<{
			error: string;
		}>();

		expect(body.error).toBe("Valid beta session required");
	});

	it("rejects an unknown beta portal session token", async () => {
		const response = await SELF.fetch(
			"http://example.com/beta/session",
			{
				headers: {
					authorization: "Bearer unknown-session-token"
				}
			}
		);

		expect(response.status).toBe(401);
	});

	it("rejects revoked and expired beta portal sessions", async () => {
		const userInsert = await env.nomorescamcalls_db
			.prepare(`
				INSERT INTO users (
					first_name,
					last_name,
					email,
					phone_number,
					role,
					account_status,
					setup_status,
					status,
					coverage_status
				)
				VALUES (
					'Session',
					'Tester',
					'session.states@example.com',
					'+15550001006',
					'participant',
					'active',
					'registered',
					'active',
					'pending'
				)
			`)
			.run();

		const userId = Number(userInsert.meta.last_row_id);
		const revokedToken = "revoked-beta-session-token";
		const expiredToken = "expired-beta-session-token";

		const hashToken = async (token: string): Promise<string> => {
			const digest = await crypto.subtle.digest(
				"SHA-256",
				new TextEncoder().encode(token)
			);

			return Array.from(new Uint8Array(digest))
				.map((byte) => byte.toString(16).padStart(2, "0"))
				.join("");
		};

		await env.nomorescamcalls_db
			.prepare(`
				INSERT INTO portal_sessions (
					user_id,
					token_hash,
					expires_at,
					revoked_at
				)
				VALUES (?, ?, ?, ?)
			`)
			.bind(
				userId,
				await hashToken(revokedToken),
				new Date(Date.now() + 60_000).toISOString(),
				new Date().toISOString()
			)
			.run();

		await env.nomorescamcalls_db
			.prepare(`
				INSERT INTO portal_sessions (
					user_id,
					token_hash,
					expires_at
				)
				VALUES (?, ?, ?)
			`)
			.bind(
				userId,
				await hashToken(expiredToken),
				new Date(Date.now() - 60_000).toISOString()
			)
			.run();

		for (const sessionToken of [revokedToken, expiredToken]) {
			const response = await SELF.fetch(
				"http://example.com/beta/session",
				{
					headers: {
						authorization: `Bearer ${sessionToken}`
					}
				}
			);

			expect(response.status).toBe(401);
		}
	});


	it("logs out an authenticated beta participant", async () => {
		await env.nomorescamcalls_db
			.prepare(`
				INSERT INTO beta_invite_codes (
					code,
					status,
					max_uses,
					use_count
				)
				VALUES (?, 'active', 1, 0)
			`)
			.bind("BETA-LOGOUT-ONE")
			.run();

		const registrationResponse = await SELF.fetch(
			"http://example.com/beta/register",
			{
				method: "POST",
				headers: {
					"content-type": "application/json"
				},
				body: JSON.stringify({
					code: "BETA-LOGOUT-ONE",
					firstName: "Logout",
					lastName: "Participant",
					email: "logout.beta@example.com",
					phoneNumber: "+15550001007",
					carrier: "Example Carrier",
					contactMethod: "email",
					password: "beta-password"
				})
			}
		);

		expect(registrationResponse.status).toBe(201);

		const loginResponse = await SELF.fetch(
			"http://example.com/beta/login",
			{
				method: "POST",
				headers: {
					"content-type": "application/json"
				},
				body: JSON.stringify({
					email: "logout.beta@example.com",
					password: "beta-password"
				})
			}
		);

		expect(loginResponse.status).toBe(200);

		const loginBody = await loginResponse.json<{
			login: {
				sessionToken: string;
			};
		}>();

		const response = await SELF.fetch(
			"http://example.com/beta/logout",
			{
				method: "POST",
				headers: {
					authorization: `Bearer ${loginBody.login.sessionToken}`
				}
			}
		);

		expect(response.status).toBe(200);

		const body = await response.json<{
			loggedOut: boolean;
		}>();

		expect(body.loggedOut).toBe(true);

		const sessionResponse = await SELF.fetch(
			"http://example.com/beta/session",
			{
				headers: {
					authorization: `Bearer ${loginBody.login.sessionToken}`
				}
			}
		);

		expect(sessionResponse.status).toBe(401);
	});

	it("rejects a missing beta logout session token", async () => {
		const response = await SELF.fetch(
			"http://example.com/beta/logout",
			{
				method: "POST"
			}
		);

		expect(response.status).toBe(401);

		const body = await response.json<{
			error: string;
		}>();

		expect(body.error).toBe("Valid beta session required");
	});

	it("rejects an unknown beta logout session token", async () => {
		const response = await SELF.fetch(
			"http://example.com/beta/logout",
			{
				method: "POST",
				headers: {
					authorization: "Bearer unknown-logout-token"
				}
			}
		);

		expect(response.status).toBe(401);
	});

});
