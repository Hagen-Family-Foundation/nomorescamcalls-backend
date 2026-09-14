import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import worker from "../src/index";
import { CURRENT_BETA_AGREEMENT } from "../src/services/betaAgreement";
import { ensureTestSchema } from "./testSchema";

const TEST_BETA_ACCESS_CODE = "2468";
let sequence = 0;

function registrationBody(overrides: Record<string, unknown> = {}) {
	sequence += 1;
	return {
		betaAccessCode: TEST_BETA_ACCESS_CODE,
		firstName: "Beta",
		lastName: `Participant ${sequence}`,
		email: `shared-registration-${sequence}@example.com`,
		contactPhoneNumber: `+18005558${sequence.toString().padStart(3, "0")}`,
		contactMethod: "email",
		password: "shared-beta-password",
		...overrides
	};
}

function registrationRequest(body: Record<string, unknown>): Request {
	return new Request("http://example.com/portal/auth/register", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body)
	});
}

async function register(overrides: Record<string, unknown> = {}) {
	return SELF.fetch(registrationRequest(registrationBody(overrides)));
}

describe("shared beta registration through Protected-Line activation", () => {
	beforeAll(async () => {
		await ensureTestSchema();
	});

	it("allows multiple accounts through the configured shared code without persisting or returning it", async () => {
		for (let index = 0; index < 2; index += 1) {
			const body = registrationBody();
			const response = await SELF.fetch(registrationRequest(body));
			expect(response.status).toBe(201);
			const result = await response.json<{
				registered: boolean;
				token: string;
				user: Record<string, unknown>;
			}>();

			expect(result.registered).toBe(true);
			expect(result.token.length).toBeGreaterThan(20);
			expect(result.user).toMatchObject({
				firstName: "Beta",
				email: body.email,
				contactPhoneNumber: body.contactPhoneNumber,
				role: "participant",
				accountStatus: "active",
				setupStatus: "onboarding_incomplete"
			});
			expect(JSON.stringify(result)).not.toContain(TEST_BETA_ACCESS_CODE);

			const stored = await env.nomorescamcalls_db
				.prepare("SELECT * FROM users WHERE email = ?")
				.bind(body.email)
				.first<Record<string, unknown>>();
			expect(stored?.password_hash).not.toBe(body.password);
			expect(String(stored?.password_hash)).toMatch(/^pbkdf2_sha256\$/);
			expect(JSON.stringify(stored)).not.toContain(TEST_BETA_ACCESS_CODE);
		}

		const retiredTables = await env.nomorescamcalls_db
			.prepare(`
				SELECT name
				FROM sqlite_master
				WHERE type = 'table'
					AND name IN ('beta_invitations', 'beta_invite_codes')
			`)
			.all<{ name: string }>();
		expect(retiredTables.results).toEqual([]);
	});

	it("rejects a wrong code without creating an account", async () => {
		const email = `wrong-code-${sequence + 1}@example.com`;
		const response = await register({
			betaAccessCode: "1357",
			email
		});
		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({
			error: "Beta access code is invalid",
			code: "invalid_beta_access_code"
		});
		expect(await env.nomorescamcalls_db
			.prepare("SELECT id FROM users WHERE email = ?")
			.bind(email)
			.first()).toBeNull();
	});

	it.each([undefined, "", "123", "12a4", "12345", " 2468 "])(
		"fails closed when server configuration is %j",
		async (configuredCode) => {
			const response = await worker.fetch(
				registrationRequest(registrationBody()),
				{
					...env,
					BETA_ACCESS_CODE: configuredCode
				} as Env
			);
			expect(response.status).toBe(503);
			expect(await response.json()).toMatchObject({
				error: "Beta registration is temporarily unavailable",
				code: "beta_access_configuration_unavailable"
			});
		}
	);

	it("keeps agreement, protected-line provisioning, and forwarding independent of beta admission", async () => {
		const registration = await register();
		expect(registration.status).toBe(201);
		const registered = await registration.json<{
			token: string;
			user: { id: number };
		}>();

		const beforeAgreement = await SELF.fetch(
			"http://example.com/portal/me/locations",
			{
				method: "POST",
				headers: { authorization: `Bearer ${registered.token}` }
			}
		);
		expect(beforeAgreement.status).toBe(409);

		const agreement = await SELF.fetch(
			"http://example.com/portal/agreement/accept",
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					authorization: `Bearer ${registered.token}`
				},
				body: JSON.stringify({ version: CURRENT_BETA_AGREEMENT.version })
			}
		);
		expect(agreement.status).toBe(200);

		const locationResponse = await SELF.fetch(
			"http://example.com/portal/me/locations",
			{
				method: "POST",
				headers: { authorization: `Bearer ${registered.token}` }
			}
		);
		const location = (await locationResponse.json<{
			location: { id: number };
		}>()).location;

		const protectedPhoneNumber = `+1800666${sequence.toString().padStart(4, "0")}`;
		const lineResponse = await SELF.fetch(
			`http://example.com/portal/me/locations/${location.id}/protected-lines`,
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					authorization: `Bearer ${registered.token}`
				},
				body: JSON.stringify({
					protectedPhoneNumber,
					callerFacingBusinessName: "Shared Gate Plumbing",
					carrier: "Synthetic Landline Carrier"
				})
			}
		);
		expect(lineResponse.status).toBe(201);
		const line = (await lineResponse.json<{
			protectedLine: { id: number; protectedPhoneNumber: string };
		}>()).protectedLine;

		await env.nomorescamcalls_db.batch([
			env.nomorescamcalls_db.prepare(`
				INSERT INTO system_numbers (
					provider_number_id,
					phone_number,
					lifecycle_state,
					available_since,
					verification_state,
					last_verified_at
				)
				VALUES (?, ?, 'ready', CURRENT_TIMESTAMP, 'verified', CURRENT_TIMESTAMP)
			`).bind(
				`test-beta-system-number-${sequence}`,
				`+1800777${sequence.toString().padStart(4, "0")}`
			),
			env.nomorescamcalls_db.prepare(`
				INSERT INTO sip_credential_inventory (sip_username, status)
				VALUES (?, 'available')
			`).bind(`test_shared_gate_${sequence}`)
		]);

		const provisioning = await SELF.fetch(
			`http://example.com/portal/me/protected-lines/${line.id}/provision`,
			{
				method: "POST",
				headers: { authorization: `Bearer ${registered.token}` }
			}
		);
		expect(provisioning.status).toBe(200);
		const provisioningBody = await provisioning.json<any>();
		expect(provisioningBody.provisioning).toMatchObject({
			coverageStatus: "inactive",
			forwardingInstructions: { protectedPhoneNumber },
			delivery: {
				purpose: "forwarding_instructions",
				status: "provider_unavailable"
			}
		});
		expect(JSON.stringify(provisioningBody)).not.toContain(TEST_BETA_ACCESS_CODE);
	});
});
