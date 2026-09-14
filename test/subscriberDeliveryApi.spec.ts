import { env } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import { createAccountLocation, createProtectedLine } from "../src/services/protectedLines";
import { createUser } from "../src/services/users";
import { hashSessionToken } from "../src/utils/sessionToken";
import { ensureTestSchema } from "./testSchema";

const runtimeEnv = () => ({
	...env,
	TELNYX_API_KEY: "synthetic-key",
	TELNYX_API_BASE_URL: "https://api.telnyx.test/v2",
	TELNYX_CALL_CONTROL_APPLICATION_ID: "call-control-app",
	TELNYX_SUBSCRIBER_CREDENTIAL_CONNECTION_ID: "subscriber-connection"
} as unknown as Env);

const executionContext = {} as ExecutionContext;

async function sessionFor(userId: number, token: string) {
	await env.nomorescamcalls_db.prepare(`
		INSERT INTO portal_sessions (user_id, token_hash, expires_at)
		VALUES (?, ?, '2099-01-01T00:00:00.000Z')
	`).bind(userId, await hashSessionToken(token)).run();
}

describe("subscriber delivery portal contract", () => {
	beforeAll(async () => {
		await ensureTestSchema();
	});

	afterEach(() => vi.unstubAllGlobals());

	it("publishes phone models and authorizes a customer-owned device only", async () => {
		const modelsResponse = await worker.fetch(
			new Request("http://example.com/portal/phone-models"),
			runtimeEnv(),
			executionContext
		);
		expect(modelsResponse.status).toBe(200);
		expect(await modelsResponse.json()).toMatchObject({
			phoneModels: [{ id: "other-model-not-listed", platform: "other" }]
		});

		const customer = await createUser(env.nomorescamcalls_db, {
			firstName: "Portal",
			lastName: "Device",
			email: "portal-device@example.com",
			contactPhoneNumber: "+18165559001",
			contactMethod: "phone",
			passwordHash: "hash",
			role: "participant"
		});
		await env.nomorescamcalls_db.prepare(`
			UPDATE users SET setup_status = 'onboarding_complete' WHERE id = ?
		`).bind(customer.id).run();
		const location = await createAccountLocation(env.nomorescamcalls_db, customer.id);
		const line = await createProtectedLine(
			env.nomorescamcalls_db,
			customer.id,
			location.id,
			{
				protectedPhoneNumber: "+19135559001",
				callerFacingBusinessName: "Portal Device"
			}
		);
		await sessionFor(customer.id, "customer-device-session");

		vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
			data: {
				id: "portal-credential",
				sip_username: "gencred-portal",
				sip_password: "never-return-this",
				expired: false
			}
		}), { status: 201 })));
		const response = await worker.fetch(
			new Request(
				`http://example.com/portal/me/protected-lines/${line.id}/device-registrations`,
				{
					method: "POST",
					headers: {
						authorization: "Bearer customer-device-session",
						"content-type": "application/json"
					},
					body: JSON.stringify({ phoneModelId: "other-model-not-listed" })
				}
			),
			runtimeEnv(),
			executionContext
		);
		expect(response.status).toBe(201);
		const body = await response.json<{
			deviceRegistration: { id: number; status: string };
			deviceAuthenticator: string;
		}>();
		expect(body.deviceRegistration.status).toBe("pending");
		expect(body.deviceAuthenticator.length).toBeGreaterThan(20);
		expect(JSON.stringify(body)).not.toContain("never-return-this");
		expect(JSON.stringify(body)).not.toContain("portal-credential");
		expect(JSON.stringify(body)).not.toContain("gencred-portal");

		const admin = await createUser(env.nomorescamcalls_db, {
			firstName: "Admin",
			lastName: "Separate",
			email: "device-admin@example.com",
			contactPhoneNumber: "+18165559002",
			contactMethod: "phone",
			passwordHash: "hash",
			role: "administrator"
		});
		await sessionFor(admin.id, "admin-device-session");
		const forbidden = await worker.fetch(
			new Request(
				`http://example.com/portal/me/protected-lines/${line.id}/device-registrations`,
				{
					method: "POST",
					headers: {
						authorization: "Bearer admin-device-session",
						"content-type": "application/json"
					},
					body: JSON.stringify({ phoneModelId: "other-model-not-listed" })
				}
			),
			runtimeEnv(),
			executionContext
		);
		expect(forbidden.status).toBe(403);
	});
});
