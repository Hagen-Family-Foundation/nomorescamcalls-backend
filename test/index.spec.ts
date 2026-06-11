import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, it, expect } from "vitest";

async function ensureTestSchema(): Promise<void> {
	await env.nomorescamcalls_db
		.prepare(`
			CREATE TABLE IF NOT EXISTS block_list (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
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
