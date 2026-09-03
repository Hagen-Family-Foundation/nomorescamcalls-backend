import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { loginBetaParticipant } from "../src/services/betaLogin";
import { createUser } from "../src/services/users";
import { hashPassword } from "../src/utils/passwordHash";
import { ensureTestSchema } from "./testSchema";

describe("user creation lifecycle", () => {
	beforeAll(async () => {
		await ensureTestSchema();
	});

	it("creates an administrator ready for administrative work and normal portal login", async () => {
		const password = "administrator-lifecycle-password";
		const administrator = await createUser(env.nomorescamcalls_db, {
			email: "administrator-lifecycle@example.com",
			contactPhoneNumber: "+18005550101",
			contactMethod: "sms",
			smsContactNumber: "+18005550101",
			smsCapable: true,
			passwordHash: await hashPassword(password),
			role: "administrator"
		});

		expect(administrator).toMatchObject({
			email: "administrator-lifecycle@example.com",
			contactPhoneNumber: "+18005550101",
			contactMethod: "sms",
			smsContactNumber: "+18005550101",
			smsCapable: true,
			role: "administrator",
			accountStatus: "active",
			setupStatus: "administratively_ready",
			status: "active"
		});

		const persisted = await env.nomorescamcalls_db
			.prepare(`
				SELECT setup_status, coverage_status
				FROM users
				WHERE id = ?
			`)
			.bind(administrator.id)
			.first<{
				setup_status: string;
				coverage_status: string;
			}>();
		expect(persisted).toEqual({
			setup_status: "administratively_ready",
			coverage_status: "inactive"
		});

		const login = await loginBetaParticipant(
			env.nomorescamcalls_db,
			administrator.email ?? "",
			password
		);
		expect(login).not.toBeNull();
		expect(login?.user).toMatchObject({
			id: administrator.id,
			role: "administrator",
			accountStatus: "active",
			setupStatus: "administratively_ready",
			status: "active"
		});
		expect(login?.sessionToken).toBeTruthy();

		const meResponse = await SELF.fetch("http://example.com/portal/me", {
			headers: {
				authorization: `Bearer ${login?.sessionToken}`
			}
		});
		expect(meResponse.status).toBe(200);
		expect(await meResponse.json()).toMatchObject({
			user: {
				id: administrator.id,
				role: "administrator",
				setup_status: "administratively_ready"
			},
			locations: [],
			protected_lines: []
		});

		const currentAgreementResponse = await SELF.fetch(
			"http://example.com/portal/agreement/current",
			{
				headers: {
					authorization: `Bearer ${login?.sessionToken}`
				}
			}
		);
		expect(currentAgreementResponse.status).toBe(403);

		const acceptanceResponse = await SELF.fetch(
			"http://example.com/portal/agreement/accept",
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					authorization: `Bearer ${login?.sessionToken}`
				},
				body: JSON.stringify({ version: "not-applicable" })
			}
		);
		expect(acceptanceResponse.status).toBe(403);

		for (const customerOnlyPath of [
			"/portal/me/summary",
			"/portal/me/calls"
		]) {
			const customerOnlyResponse = await SELF.fetch(
				`http://example.com${customerOnlyPath}`,
				{
					headers: {
						authorization: `Bearer ${login?.sessionToken}`
					}
				}
			);
			expect(customerOnlyResponse.status).toBe(403);
		}

		const invitationAuthorization = await SELF.fetch(
			"http://example.com/beta/invitations",
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					authorization: `Bearer ${login?.sessionToken}`
				},
				body: JSON.stringify({})
			}
		);
		expect(invitationAuthorization.status).toBe(400);
		expect(await invitationAuthorization.json()).toMatchObject({
			code: "email_destination_required"
		});

		const agreementAcceptanceCount = await env.nomorescamcalls_db
			.prepare(`
				SELECT COUNT(*) AS count
				FROM beta_agreement_acceptances
				WHERE user_id = ?
			`)
			.bind(administrator.id)
			.first<{ count: number }>();
		expect(agreementAcceptanceCount?.count).toBe(0);
	});

	it("preserves subscriber onboarding and inactive coverage defaults", async () => {
		const subscriber = await createUser(env.nomorescamcalls_db, {
			email: "subscriber-lifecycle@example.com",
			contactPhoneNumber: "+18005550102",
			role: "subscriber"
		});

		expect(subscriber.setupStatus).toBe("onboarding_incomplete");

		const persisted = await env.nomorescamcalls_db
			.prepare("SELECT coverage_status FROM users WHERE id = ?")
			.bind(subscriber.id)
			.first<{ coverage_status: string }>();
		expect(persisted?.coverage_status).toBe("inactive");
	});
});
