import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, it, expect } from "vitest";

async function ensureTestSchema(): Promise<void> {
	await env.nomorescamcalls_db
		.prepare(`
			CREATE TABLE IF NOT EXISTS users (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				phone_number TEXT NOT NULL UNIQUE,
				screening_number TEXT UNIQUE,
				app_identity TEXT UNIQUE,
				status TEXT NOT NULL DEFAULT 'active',
				created_at TEXT DEFAULT CURRENT_TIMESTAMP
			)
		`)
		.run();

	await env.nomorescamcalls_db
		.prepare(`
			CREATE TABLE IF NOT EXISTS block_list (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id INTEGER,
				phone_number TEXT NOT NULL UNIQUE,
				reason TEXT NOT NULL,
				created_at TEXT DEFAULT CURRENT_TIMESTAMP
			)
		`)
		.run();

	await env.nomorescamcalls_db
		.prepare(`
			CREATE TABLE IF NOT EXISTS allow_list (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id INTEGER,
				phone_number TEXT NOT NULL UNIQUE,
				reason TEXT NOT NULL,
				created_at TEXT DEFAULT CURRENT_TIMESTAMP
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
				approved_app_identity TEXT,
				created_at TEXT DEFAULT CURRENT_TIMESTAMP
			)
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

	it("creates and lists user routing records", async () => {
		const createResponse = await SELF.fetch("http://example.com/users", {
			method: "POST",
			headers: {
				"content-type": "application/json"
			},
			body: JSON.stringify({
				phoneNumber: "+18165550002",
				screeningNumber: "+18165550003",
				appIdentity: "user_18165550002",
				status: "active"
			})
		});

		expect(createResponse.status).toBe(200);

		const createBody = await createResponse.json<{
			user: {
				phoneNumber: string;
				screeningNumber: string;
				appIdentity: string;
				status: string;
			};
		}>();

		expect(createBody.user.phoneNumber).toBe("+18165550002");
		expect(createBody.user.screeningNumber).toBe("+18165550003");
		expect(createBody.user.appIdentity).toBe("user_18165550002");
		expect(createBody.user.status).toBe("active");

		const listResponse = await SELF.fetch("http://example.com/users?limit=10");

		expect(listResponse.status).toBe(200);

		const listBody = await listResponse.json<{
			users: Array<{
				phoneNumber: string;
				screeningNumber: string | null;
				appIdentity: string | null;
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
					app_identity,
					status
				)
				VALUES (?, ?, ?, 'active')
				ON CONFLICT(phone_number) DO UPDATE SET
					screening_number = excluded.screening_number,
					app_identity = excluded.app_identity,
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
				appIdentity: string;
				status: string;
			} | null;
			approvedDestination: {
				destinationType: string;
				destination: string | null;
			};
			simulatedTelnyxRequest: {
				body: {
					destinationType?: string;
					appIdentity?: string | null;
					simulatedDestination?: string | null;
					liveApiReady?: boolean;
				};
			} | null;
		}>();

		expect(body.protectedUser).not.toBeNull();
		expect(body.protectedUser?.phoneNumber).toBe("+18165550001");
		expect(body.protectedUser?.screeningNumber).toBe("+18165550000");
		expect(body.protectedUser?.appIdentity).toBe("user_18165550001");
		expect(body.protectedUser?.status).toBe("active");
		expect(body.approvedDestination.destinationType).toBe("app");
		expect(body.approvedDestination.destination).toBe("user_18165550001");
		expect(body.simulatedTelnyxRequest?.body.destinationType).toBe("app");
		expect(body.simulatedTelnyxRequest?.body.appIdentity).toBe("user_18165550001");
		expect(body.simulatedTelnyxRequest?.body.simulatedDestination).toBe("telnyx_app:user_18165550001");
		expect(body.simulatedTelnyxRequest?.body.liveApiReady).toBe(false);
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
		expect(body.plannedChallengeOutcome.nextCommand).toBe("bridge");
		expect(body.plannedTelnyxCommand.command).toBe("bridge");
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
