import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, it, expect } from "vitest";
import { ensureTestSchema } from "./testSchema";

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
		await env.nomorescamcalls_db.prepare(`
			INSERT INTO users (
				phone_number,
				screening_number,
				sip_username,
				caller_facing_business_name,
				status,
				coverage_status
			)
			VALUES (?, ?, ?, ?, 'active', 'active')
			ON CONFLICT(phone_number) DO UPDATE SET
				screening_number = excluded.screening_number,
				sip_username = excluded.sip_username,
				caller_facing_business_name = excluded.caller_facing_business_name,
				status = 'active',
				coverage_status = 'active'
		`).bind(
			"+18005550100",
			"+18005550001",
			"test_user_18005550100",
			"Acme Repair"
		).run();

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
						to: "+18005550001"
					}
				}
			})
		});

		expect(response.status).toBe(200);

		const body = await response.json<{
			received: boolean;
			screened: boolean;
			callerNumber: string;
			telnyxEvent: {
				eventType: string;
				callControlId: string;
				callSessionId: string;
				from: string;
				to: string;
			};
			answerRequest: {
				method: string;
				endpoint: string;
			};
			firstRequest: {
				method: string;
				endpoint: string;
				body: {
					payload: string;
				};
			};
			answerExecution: {
				executed: boolean;
			};
			firstRequestExecution: {
				executed: boolean;
			};
		}>();

		expect(body.received).toBe(true);
		expect(body.screened).toBe(true);
		expect(body.callerNumber).toBe("+18005551234");
		expect(body.telnyxEvent.eventType).toBe("call.initiated");
		expect(body.telnyxEvent.callControlId).toBe("test-call-control-id");
		expect(body.answerRequest.method).toBe("POST");
		expect(body.answerRequest.endpoint).toBe(
			"/calls/test-call-control-id/actions/answer"
		);
		expect(body.firstRequest.method).toBe("POST");
		expect(body.firstRequest.endpoint).toBe(
			"/calls/test-call-control-id/actions/speak"
		);
		expect(body.firstRequest.body.payload).toBe(
			"Thank you for calling Acme Repair. Please say your name and reason for calling so that we may route your call appropriately. Thank you."
		);
		expect(body.answerExecution.executed).toBe(false);
		expect(body.firstRequestExecution.executed).toBe(false);
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



	it("creates an incomplete subscriber before provisioning", async () => {
		const createResponse = await SELF.fetch("http://example.com/users", {
			method: "POST",
			headers: {
				"content-type": "application/json"
			},
			body: JSON.stringify({
				phoneNumber: "+18005550302"
			})
		});

		expect(createResponse.status).toBe(201);

		const createBody = await createResponse.json<{
			user: {
				id: number;
				phoneNumber: string;
				screeningNumber: string | null;
				sipUsername: string | null;
				setupStatus: string;
				coverageStatus: string;
				status: string;
			};
		}>();

		expect(createBody.user.phoneNumber).toBe("+18005550302");
		expect(createBody.user.screeningNumber).toBeNull();
		expect(createBody.user.sipUsername).toBeNull();
		expect(createBody.user.setupStatus).toBe("onboarding_incomplete");
		expect(createBody.user.coverageStatus).toBe("inactive");
		expect(createBody.user.status).toBe("active");

		const provisionResponse = await SELF.fetch(
			`http://example.com/users/${createBody.user.id}/provision`,
			{ method: "POST" }
		);
		const provisionBody = await provisionResponse.json<{
			code: string;
			missingRequirements: string[];
		}>();

		expect(provisionResponse.status).toBe(409);
		expect(provisionBody.code).toBe("onboarding_incomplete");
		expect(provisionBody.missingRequirements).toEqual(
			expect.arrayContaining([
				"caller_facing_business_name",
				"required_agreement"
			])
		);

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

		expect(listBody.users.some((user) => user.phoneNumber === "+18005550302")).toBe(true);
	});

	it("resolves protected user from Telnyx destination number", async () => {
		await env.nomorescamcalls_db
			.prepare(`
				INSERT INTO users (
					phone_number,
					screening_number,
					sip_username,
					caller_facing_business_name,
					status,
					coverage_status
				)
				VALUES (?, ?, ?, ?, 'active', 'active')
				ON CONFLICT(phone_number) DO UPDATE SET
					screening_number = excluded.screening_number,
					sip_username = excluded.sip_username,
					caller_facing_business_name = excluded.caller_facing_business_name,
					status = 'active',
					coverage_status = 'active'
			`)
			.bind(
				"+18005550101",
				"+18005550000",
				"test_user_18005550101",
				"Protected Test Business"
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
				screeningNumber: string | null;
			};
			answerRequest: {
				endpoint: string;
			};
			firstRequest: {
				endpoint: string;
				body: {
					payload: string;
				};
			};
		}>();

		expect(body.protectedUser).not.toBeNull();
		expect(body.protectedUser?.phoneNumber).toBe("+18005550101");
		expect(body.protectedUser?.screeningNumber).toBe("+18005550000");
		expect(body.protectedUser?.sipUsername).toBe("test_user_18005550101");
		expect(body.protectedUser?.status).toBe("active");
		expect(body.approvedDestination.destinationType).toBe("app");
		expect(body.approvedDestination.destination).toBe(
			"test_user_18005550101"
		);
		expect(body.approvedDestination.screeningNumber).toBe(
			"+18005550000"
		);
		expect(body.answerRequest.endpoint).toBe(
			"/calls/test-user-call-control-id/actions/answer"
		);
		expect(body.firstRequest.endpoint).toBe(
			"/calls/test-user-call-control-id/actions/speak"
		);
		expect(body.firstRequest.body.payload).toBe(
			"Thank you for calling Protected Test Business. Please say your name and reason for calling so that we may route your call appropriately. Thank you."
		);
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
			"http://example.com/portal/auth/register",
			{
				method: "POST",
				headers: {
					"content-type": "application/json"
				},
				body: JSON.stringify({
					code: "BETA-REGISTER-ONE",
					firstName: "Kelly",
					lastName: "Hagen",
					callerFacingBusinessName: "Hagen Home Services",
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
		}>();

		expect(body.registered).toBe(true);
		expect(body.user.firstName).toBe("Kelly");
		expect(body.user.lastName).toBe("Hagen");
		expect((body.user as any).callerFacingBusinessName).toBe("Hagen Home Services");
		expect(body.user.email).toBe("kelly.beta@example.com");
		expect(body.user.phoneNumber).toBe("+15550001001");
		expect(body.user.carrier).toBe("Example Carrier");
		expect(body.user.contactMethod).toBe("email");
		expect(body.user.role).toBe("participant");
		expect(body.user.accountStatus).toBe("active");
		expect(body.user.setupStatus).toBe("onboarding_incomplete");
		expect(body.user.coverageStatus).toBe("inactive");

		const storedUser = await env.nomorescamcalls_db
			.prepare(`
				SELECT id, password_hash, caller_facing_business_name
				FROM users
				WHERE phone_number = ?
			`)
			.bind("+15550001001")
			.first<{
				id: number;
				password_hash: string;
				caller_facing_business_name: string;
			}>();

		expect(storedUser).not.toBeNull();
		expect(storedUser?.password_hash).not.toBe("beta-password");
		expect(storedUser?.password_hash.startsWith("pbkdf2_sha256$")).toBe(true);
		expect(storedUser?.caller_facing_business_name).toBe("Hagen Home Services");

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
			"http://example.com/portal/auth/register",
			{
				method: "POST",
				headers: {
					"content-type": "application/json"
				},
				body: JSON.stringify({
					code: "BETA-REGISTER-ONE",
					firstName: "Second",
					lastName: "Participant",
					callerFacingBusinessName: "Second Services",
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
			"http://example.com/portal/auth/register",
			{
				method: "POST",
				headers: {
					"content-type": "application/json"
				},
				body: JSON.stringify({
					code: "BETA-REGISTER-EXPIRED",
					firstName: "Expired",
					lastName: "Participant",
					callerFacingBusinessName: "Expired Services",
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
			"http://example.com/portal/auth/register",
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
			"code, firstName, lastName, callerFacingBusinessName, email, phoneNumber, carrier, contactMethod, and password are required"
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
			"http://example.com/portal/auth/register",
			{
				method: "POST",
				headers: {
					"content-type": "application/json"
				},
				body: JSON.stringify({
					code: "BETA-LOGIN-ONE",
					firstName: "Kelly",
					lastName: "Hagen",
					callerFacingBusinessName: "Hagen Home Services",
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
			"http://example.com/portal/auth/login",
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
			sessionToken: string;
			expiresAt: string;
			user: {
				id: number;
				email: string;
				role: string;
				accountStatus: string;
			};
		}>();

		expect(body.authenticated).toBe(true);
		expect(body.sessionToken.length).toBeGreaterThan(20);
		expect(body.user.email).toBe("kelly.beta@example.com");
		expect(body.user.role).toBe("participant");
		expect(body.user.accountStatus).toBe("active");
		expect(
			new Date(body.expiresAt).getTime()
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
			.bind(body.user.id)
			.first<{
				token_hash: string;
				expires_at: string;
				revoked_at: string | null;
			}>();

		expect(storedSession).not.toBeNull();
		expect(storedSession?.token_hash).not.toBe(
			body.sessionToken
		);
		expect(storedSession?.token_hash).toMatch(
			/^[a-f0-9]{64}$/
		);
		expect(storedSession?.expires_at).toBe(
			body.expiresAt
		);
		expect(storedSession?.revoked_at).toBeNull();
	});

	it("rejects an incorrect beta participant password", async () => {
		const response = await SELF.fetch(
			"http://example.com/portal/auth/login",
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

	it("rejects an unknown beta portal session token", async () => {
		const response = await SELF.fetch(
			"http://example.com/portal/me",
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
					'onboarding_incomplete',
					'active',
					'inactive'
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
				"http://example.com/portal/me",
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
			"http://example.com/portal/auth/register",
			{
				method: "POST",
				headers: {
					"content-type": "application/json"
				},
				body: JSON.stringify({
					code: "BETA-LOGOUT-ONE",
					firstName: "Logout",
					lastName: "Participant",
					callerFacingBusinessName: "Logout Services",
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
			"http://example.com/portal/auth/login",
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
			sessionToken: string;
		}>();

		const response = await SELF.fetch(
			"http://example.com/portal/auth/logout",
			{
				method: "POST",
				headers: {
				authorization: `Bearer ${loginBody.sessionToken}`
				}
			}
		);

		expect(response.status).toBe(200);

		const body = await response.json<{
			loggedOut: boolean;
		}>();

		expect(body.loggedOut).toBe(true);

		const sessionResponse = await SELF.fetch(
			"http://example.com/portal/me",
			{
				headers: {
				authorization: `Bearer ${loginBody.sessionToken}`
				}
			}
		);

		expect(sessionResponse.status).toBe(401);
	});

	it("rejects a missing portal logout session token", async () => {
		const response = await SELF.fetch(
			"http://example.com/portal/auth/logout",
			{
				method: "POST"
			}
		);

		expect(response.status).toBe(401);

		const body = await response.json<{
			error: string;
		}>();

		expect(body.error).toBe("Valid portal session required");
	});

	it("rejects an unknown beta logout session token", async () => {
		const response = await SELF.fetch(
			"http://example.com/portal/auth/logout",
			{
				method: "POST",
				headers: {
					authorization: "Bearer unknown-logout-token"
				}
			}
		);

		expect(response.status).toBe(401);
	});

	it("returns the authenticated participant dashboard summary", async () => {
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
			.bind("BETA-DASHBOARD-SUMMARY")
			.run();

		const registrationResponse = await SELF.fetch(
			"http://example.com/portal/auth/register",
			{
				method: "POST",
				headers: {
					"content-type": "application/json"
				},
				body: JSON.stringify({
					code: "BETA-DASHBOARD-SUMMARY",
					firstName: "Dashboard",
					lastName: "Summary",
					callerFacingBusinessName: "Dashboard Services",
					email: "dashboard.summary@example.com",
					phoneNumber: "+15550002001",
					carrier: "Example Carrier",
					contactMethod: "email",
					password: "beta-password"
				})
			}
		);

		expect(registrationResponse.status).toBe(201);

		const loginResponse = await SELF.fetch(
			"http://example.com/portal/auth/login",
			{
				method: "POST",
				headers: {
					"content-type": "application/json"
				},
				body: JSON.stringify({
					email: "dashboard.summary@example.com",
					password: "beta-password"
				})
			}
		);

		expect(loginResponse.status).toBe(200);

		const loginBody = await loginResponse.json<{
			sessionToken: string;
			user: {
				id: number;
			};
		}>();

		await env.nomorescamcalls_db
			.prepare(`
				UPDATE users
				SET
					screening_number = ?,
					setup_status = ?
				WHERE id = ?
			`)
			.bind(
				"+15550002999",
				"forwarding_ready",
				loginBody.user.id
			)
			.run();

		await env.nomorescamcalls_db
			.prepare(`
				INSERT INTO call_events (
					user_id,
					caller_hash,
					decision,
					score,
					reason,
					created_at
				)
				VALUES
					(?, 'summary-caller-one', 'release', 95, 'released', '2026-07-20T10:00:00.000Z'),
					(?, 'summary-caller-two', 'observe', 70, 'diverted', '2026-07-21T11:00:00.000Z'),
					(NULL, 'other-user-call', 'release', 100, 'unrelated', '2026-07-22T12:00:00.000Z')
			`)
			.bind(
				loginBody.user.id,
				loginBody.user.id
			)
			.run();

		const response = await SELF.fetch(
			"http://example.com/portal/me/summary",
			{
				headers: {
					authorization:
						`Bearer ${loginBody.sessionToken}`
				}
			}
		);

		expect(response.status).toBe(200);

		const body = await response.json<{
			service_status: string;
			screening_number: string | null;
			total_calls: number;
			successful_calls: number;
			diverted_calls: number;
			last_call_at: string | null;
		}>();

		expect(body).toEqual({
			service_status: "forwarding_ready",
			screening_number: "+15550002999",
			total_calls: 2,
			successful_calls: 1,
			diverted_calls: 1,
			last_call_at: "2026-07-21T11:00:00.000Z"
		});
	});

	it("returns only the authenticated participant recent calls", async () => {
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
			.bind("BETA-DASHBOARD-CALLS")
			.run();

		const registrationResponse = await SELF.fetch(
			"http://example.com/portal/auth/register",
			{
				method: "POST",
				headers: {
					"content-type": "application/json"
				},
				body: JSON.stringify({
					code: "BETA-DASHBOARD-CALLS",
					firstName: "Dashboard",
					lastName: "Calls",
					callerFacingBusinessName: "Dashboard Call Services",
					email: "dashboard.calls@example.com",
					phoneNumber: "+15550002002",
					carrier: "Example Carrier",
					contactMethod: "email",
					password: "beta-password"
				})
			}
		);

		expect(registrationResponse.status).toBe(201);

		const loginResponse = await SELF.fetch(
			"http://example.com/portal/auth/login",
			{
				method: "POST",
				headers: {
					"content-type": "application/json"
				},
				body: JSON.stringify({
					email: "dashboard.calls@example.com",
					password: "beta-password"
				})
			}
		);

		expect(loginResponse.status).toBe(200);

		const loginBody = await loginResponse.json<{
			sessionToken: string;
			user: {
				id: number;
			};
		}>();

		await env.nomorescamcalls_db
			.prepare(`
				INSERT INTO call_events (
					user_id,
					caller_hash,
					decision,
					score,
					reason,
					created_at
				)
				VALUES
					(?, 'calls-caller-one', 'release', 94, 'released', '2026-07-19T09:00:00.000Z'),
					(?, 'calls-caller-two', 'observe', 68, 'diverted', '2026-07-20T10:00:00.000Z'),
					(?, 'calls-caller-three', 'connect', 90, 'connected', '2026-07-21T11:00:00.000Z'),
					(NULL, 'calls-other-user', 'release', 100, 'unrelated', '2026-07-22T12:00:00.000Z')
			`)
			.bind(
				loginBody.user.id,
				loginBody.user.id,
				loginBody.user.id
			)
			.run();

		const response = await SELF.fetch(
			"http://example.com/portal/me/calls?limit=2",
			{
				headers: {
					authorization:
						`Bearer ${loginBody.sessionToken}`
				}
			}
		);

		expect(response.status).toBe(200);

		const body = await response.json<{
			calls: Array<{
				id: number;
				call_id: number;
				occurred_at: string;
				outcome: string;
				status: string;
				decision: string;
				score: number;
				reason: string;
			}>;
		}>();

		expect(body.calls).toHaveLength(2);

		expect(body.calls[0]).toMatchObject({
			occurred_at: "2026-07-21T11:00:00.000Z",
			outcome: "successful",
			status: "successful",
			decision: "connect",
			score: 90,
			reason: "connected"
		});

		expect(body.calls[1]).toMatchObject({
			occurred_at: "2026-07-20T10:00:00.000Z",
			outcome: "diverted",
			status: "diverted",
			decision: "observe",
			score: 68,
			reason: "diverted"
		});

		expect(body.calls[0].call_id).toBe(
			body.calls[0].id
		);

		expect(body.calls[1].call_id).toBe(
			body.calls[1].id
		);
	});

	it("rejects unauthenticated participant dashboard requests", async () => {
		for (const path of [
			"/portal/me/summary",
			"/portal/me/calls"
		]) {
			const response = await SELF.fetch(
				`http://example.com${path}`
			);

			expect(response.status).toBe(401);

			const body = await response.json<{
				error: string;
			}>();

			expect(body.error).toBe(
				"Valid portal session required"
			);
		}
	});

});
describe("Knowledge Engine API", () => {
	beforeAll(async () => {
		await ensureTestSchema();
	});

	it("searches Evidence Library records and retains the search", async () => {
		await env.nomorescamcalls_db
			.prepare(`
				INSERT OR REPLACE INTO evidence_library_calls (
					call_session_id,
					call_control_id,
					call_started_at,
					final_standing,
					final_disposition,
					evidence_box,
					caller_state,
					call_day_of_week,
					call_start_time,
					subscriber_state
				)
				VALUES (
					'api-knowledge-session',
					'api-knowledge-control',
					'2026-08-03T14:30:00.000Z',
					70,
					'diverted',
					'{}',
					'Florida',
					'Monday',
					'14:30:00',
					'Missouri'
				)
			`)
			.run();

		const searchResponse = await SELF.fetch(
			"http://example.com/knowledge/search",
			{
				method: "POST",
				headers: {
					"content-type":
						"application/json"
				},
				body: JSON.stringify({
					criteria: {
						caller_state:
							"Florida",
						call_day_of_week:
							"Monday",
						final_disposition:
							"diverted"
					},
					sortField:
						"call_started_at",
					sortDirection: "ASC"
				})
			}
		);

		expect(searchResponse.status).toBe(200);

		const searchBody =
			await searchResponse.json<{
				result: {
					searchHistoryId: number;
					resultCount: number;
					records: Array<{
						call_session_id:
							string;
					}>;
				};
			}>();

		expect(
			searchBody.result.resultCount
		).toBe(1);

		expect(
			searchBody.result.records[0]
				.call_session_id
		).toBe(
			"api-knowledge-session"
		);

		const historyResponse =
			await SELF.fetch(
				"http://example.com/knowledge/search-history"
			);

		expect(historyResponse.status).toBe(200);

		const historyBody =
			await historyResponse.json<{
				history: Array<{
					id: number;
					resultCount: number;
				}>;
			}>();

		expect(
			historyBody.history.some(
				(record) =>
					record.id ===
						searchBody.result
							.searchHistoryId
					&& record.resultCount === 1
			)
		).toBe(true);
	});

	it("adds a selected search to the Recipe Catalog and reruns it", async () => {
		await env.nomorescamcalls_db
			.prepare(`
				INSERT OR REPLACE INTO evidence_library_calls (
					call_session_id,
					call_control_id,
					call_started_at,
					final_standing,
					final_disposition,
					evidence_box,
					caller_state,
					call_day_of_week,
					call_start_time,
					subscriber_state
				)
				VALUES (
					'api-recipe-session',
					'api-recipe-control',
					'2026-08-05T16:00:00.000Z',
					72,
					'diverted',
					'{}',
					'Florida',
					'Wednesday',
					'16:00:00',
					'Missouri'
				)
			`)
			.run();

		const searchResponse = await SELF.fetch(
			"http://example.com/knowledge/search",
			{
				method: "POST",
				headers: {
					"content-type":
						"application/json"
				},
				body: JSON.stringify({
					criteria: {
						caller_state:
							"Florida",
						final_disposition:
							"diverted"
					}
				})
			}
		);

		expect(searchResponse.status).toBe(200);

		const searchBody =
			await searchResponse.json<{
				result: {
					searchHistoryId: number;
				};
			}>();

		const saveResponse = await SELF.fetch(
			"http://example.com/knowledge/recipes",
			{
				method: "POST",
				headers: {
					"content-type":
						"application/json"
				},
				body: JSON.stringify({
					searchHistoryId:
						searchBody.result
							.searchHistoryId,
					title:
						"Florida Diverted Calls",
					purpose:
						"Find diverted calls originating from Florida."
				})
			}
		);

		expect(saveResponse.status).toBe(200);

		const saveBody =
			await saveResponse.json<{
				recipe: {
					id: number;
					title: string;
				};
			}>();

		expect(saveBody.recipe.title).toBe(
			"Florida Diverted Calls"
		);

		const catalogResponse =
			await SELF.fetch(
				"http://example.com/knowledge/recipes"
			);

		expect(catalogResponse.status).toBe(200);

		const catalogBody =
			await catalogResponse.json<{
				recipes: Array<{
					id: number;
					title: string;
				}>;
			}>();

		expect(
			catalogBody.recipes.some(
				(recipe) =>
					recipe.id ===
						saveBody.recipe.id
					&& recipe.title ===
						"Florida Diverted Calls"
			)
		).toBe(true);

		const runResponse = await SELF.fetch(
			`http://example.com/knowledge/recipes/${saveBody.recipe.id}/run`,
			{
				method: "POST",
				headers: {
					"content-type":
						"application/json"
				},
				body: JSON.stringify({})
			}
		);

		expect(runResponse.status).toBe(200);

		const runBody =
			await runResponse.json<{
				result: {
					resultCount: number;
				};
			}>();

		expect(
			runBody.result.resultCount
		).toBeGreaterThan(0);
	});
});
