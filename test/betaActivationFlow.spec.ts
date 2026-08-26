import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { loginBetaParticipant } from "../src/services/betaLogin";
import { issueBetaInvitation } from "../src/services/betaInvitations";
import { createUser, type UserRecord } from "../src/services/users";
import { hashPassword } from "../src/utils/passwordHash";
import { ensureTestSchema } from "./testSchema";

interface IssuedInvitationBody {
	invitation: {
		id: number;
		responseToken: string;
		selectedChannel: "sms" | "email";
		selectedDestination: string;
		status: string;
		issuedAt: string;
		awaitingResponseAt: string;
		responseReceivedAt: string | null;
		acceptedAt: string | null;
		credentialIssuedAt: string | null;
	};
	delivery: {
		channel: "sms" | "email";
		destination: string;
		status: string;
		failureReason: string | null;
	};
}

interface AcceptedInvitationBody extends IssuedInvitationBody {
	accepted: boolean;
	credential: {
		code: string;
		portalPath: string;
	};
}

describe("beta invitation through Protected-Line activation", () => {
	let administrator: UserRecord;
	let administratorToken: string;

	beforeAll(async () => {
		await ensureTestSchema();
		administrator = await createUser(env.nomorescamcalls_db, {
			firstName: "Beta",
			lastName: "Administrator",
			email: "beta-flow-administrator@example.com",
			contactPhoneNumber: "+18005558000",
			contactMethod: "email",
			passwordHash: await hashPassword("beta-flow-admin-password"),
			role: "administrator"
		});
		const login = await loginBetaParticipant(
			env.nomorescamcalls_db,
			administrator.email ?? "",
			"beta-flow-admin-password"
		);
		if (!login) {
			throw new Error("Failed to authenticate beta invitation administrator");
		}
		administratorToken = login.sessionToken;
	});

	async function issueInvitation(input: Record<string, unknown>) {
		return SELF.fetch("http://example.com/beta/invitations", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				authorization: `Bearer ${administratorToken}`
			},
			body: JSON.stringify(input)
		});
	}

	async function respond(responseToken: string, response: string) {
		return SELF.fetch("http://example.com/beta/invitations/respond", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ responseToken, response })
		});
	}

	it("prefers only explicitly approved SMS and otherwise uses email without pretending delivery succeeded", async () => {
		const smsResponse = await issueInvitation({
			smsContactNumber: "+18005558001",
			smsCapable: true,
			email: "sms-fallback@example.com"
		});
		expect(smsResponse.status).toBe(201);
		const smsBody = await smsResponse.json<IssuedInvitationBody>();
		expect(smsBody.invitation).toMatchObject({
			selectedChannel: "sms",
			selectedDestination: "+18005558001",
			status: "awaiting_response",
			acceptedAt: null,
			credentialIssuedAt: null
		});
		expect(smsBody.delivery).toMatchObject({
			channel: "sms",
			destination: "+18005558001",
			status: "provider_unavailable"
		});
		expect(smsBody.delivery.failureReason).toContain("No approved outbound");

		const emailResponse = await issueInvitation({
			smsContactNumber: "+18005558002",
			smsCapable: false,
			email: "email-invitation@example.com"
		});
		expect(emailResponse.status).toBe(201);
		const emailBody = await emailResponse.json<IssuedInvitationBody>();
		expect(emailBody.invitation).toMatchObject({
			selectedChannel: "email",
			selectedDestination: "email-invitation@example.com"
		});
		expect(emailBody.delivery.destination).not.toBe("+18005558002");

		const issuedCodeCount = await env.nomorescamcalls_db
			.prepare(`
				SELECT COUNT(*) AS count
				FROM beta_invite_codes
				WHERE invitation_id IN (?, ?)
			`)
			.bind(smsBody.invitation.id, emailBody.invitation.id)
			.first<{ count: number }>();
		expect(issuedCodeCount?.count).toBe(0);
	});

	it("accepts Y or YES case-insensitively, rejects other responses, and issues only one credential", async () => {
		for (const [index, affirmative] of ["Y", "YES", "y", "yes"].entries()) {
			const issueResponse = await issueInvitation({
				email: `affirmative-${index}@example.com`
			});
			const issued = await issueResponse.json<IssuedInvitationBody>();
			const acceptedResponse = await respond(
				issued.invitation.responseToken,
				affirmative
			);
			expect(acceptedResponse.status).toBe(200);
			const accepted = await acceptedResponse.json<AcceptedInvitationBody>();
			expect(accepted.accepted).toBe(true);
			expect(accepted.credential.code).toBeTruthy();
			expect(accepted.credential.portalPath).toContain(
				`invite=${accepted.credential.code}`
			);
			expect(accepted.invitation.acceptedAt).toBeTruthy();
			expect(accepted.invitation.credentialIssuedAt).toBeTruthy();

			const repeated = await respond(
				issued.invitation.responseToken,
				"YES"
			);
			const repeatedBody = await repeated.json<AcceptedInvitationBody>();
			expect(repeatedBody.credential.code).toBe(accepted.credential.code);
			expect((await env.nomorescamcalls_db
				.prepare("SELECT COUNT(*) AS count FROM beta_invite_codes WHERE invitation_id = ?")
				.bind(issued.invitation.id)
				.first<{ count: number }>())?.count).toBe(1);
		}

		const nonAffirmativeIssue = await issueInvitation({
			email: "not-affirmative@example.com"
		});
		const nonAffirmativeInvitation = await nonAffirmativeIssue
			.json<IssuedInvitationBody>();
		const nonAffirmativeResponse = await respond(
			nonAffirmativeInvitation.invitation.responseToken,
			"Maybe"
		);
		expect(await nonAffirmativeResponse.json()).toMatchObject({
			accepted: false,
			credential: null,
			invitation: { status: "awaiting_response" }
		});
		expect((await env.nomorescamcalls_db
			.prepare("SELECT COUNT(*) AS count FROM beta_invite_codes WHERE invitation_id = ?")
			.bind(nonAffirmativeInvitation.invitation.id)
			.first<{ count: number }>())?.count).toBe(0);

		const nonexistent = await respond("nonexistent-response-token", "YES");
		expect(nonexistent.status).toBe(404);
	});

	it("binds registration to the accepted destination and redeems the credential once", async () => {
		const issueResponse = await issueInvitation({
			email: "bound-invitation@example.com"
		});
		const issued = await issueResponse.json<IssuedInvitationBody>();
		const acceptedResponse = await respond(issued.invitation.responseToken, "YES");
		const accepted = await acceptedResponse.json<AcceptedInvitationBody>();

		const validation = await SELF.fetch(
			"http://example.com/portal/invite-codes/validate",
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ invite: accepted.credential.code })
			}
		);
		expect(validation.status).toBe(200);

		const wrongOwner = await SELF.fetch("http://example.com/portal/auth/register", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				invite: accepted.credential.code,
				firstName: "Wrong",
				lastName: "Owner",
				email: "wrong-owner@example.com",
				contactPhoneNumber: "+18005558020",
				contactMethod: "email",
				password: "wrong-owner-password"
			})
		});
		expect(wrongOwner.status).toBe(409);

		const registration = await SELF.fetch("http://example.com/portal/auth/register", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				invite: accepted.credential.code,
				firstName: "Bound",
				lastName: "Customer",
				email: "bound-invitation@example.com",
				contactPhoneNumber: "+18005558021",
				contactMethod: "email",
				password: "bound-customer-password"
			})
		});
		expect(registration.status).toBe(201);
		const registrationBody = await registration.json<{
			token: string;
			user: { id: number; setupStatus: string };
		}>();
		expect(registrationBody.user.setupStatus).toBe("onboarding_incomplete");

		const beforeAgreementLocation = await SELF.fetch(
			"http://example.com/portal/me/locations",
			{
				method: "POST",
				headers: { authorization: `Bearer ${registrationBody.token}` }
			}
		);
		expect(beforeAgreementLocation.status).toBe(409);

		const agreement = await SELF.fetch(
			"http://example.com/portal/agreement/accept",
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					authorization: `Bearer ${registrationBody.token}`
				},
				body: JSON.stringify({ version: "v1" })
			}
		);
		expect(agreement.status).toBe(200);

		const reused = await SELF.fetch("http://example.com/portal/auth/register", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				invite: accepted.credential.code,
				firstName: "Second",
				lastName: "Customer",
				email: "bound-invitation@example.com",
				contactPhoneNumber: "+18005558022",
				contactMethod: "email",
				password: "second-customer-password"
			})
		});
		expect(reused.status).toBe(409);
		expect(await env.nomorescamcalls_db
			.prepare("SELECT status, redeemed_at FROM beta_invitations WHERE id = ?")
			.bind(issued.invitation.id)
			.first()).toMatchObject({
			status: "redeemed",
			redeemed_at: expect.any(String)
		});
	});

	it("provisions resources without coverage and activates only the confirmed exact line", async () => {
		const issueResponse = await issueInvitation({
			smsContactNumber: "+18005558030",
			smsCapable: true,
			email: "multi-line-fallback@example.com"
		});
		const issued = await issueResponse.json<IssuedInvitationBody>();
		const accepted = await (await respond(issued.invitation.responseToken, "Y"))
			.json<AcceptedInvitationBody>();
		const registration = await SELF.fetch("http://example.com/portal/auth/register", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				invite: accepted.credential.code,
				firstName: "Multi",
				lastName: "Line",
				email: "multi-line-fallback@example.com",
				contactPhoneNumber: "+18005558030",
				contactMethod: "sms",
				password: "multi-line-password"
			})
		});
		const registered = await registration.json<{
			token: string;
			user: { id: number };
		}>();
		await SELF.fetch("http://example.com/portal/agreement/accept", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				authorization: `Bearer ${registered.token}`
			},
			body: JSON.stringify({ version: "v1" })
		});

		const locations = [];
		for (let index = 0; index < 2; index += 1) {
			const response = await SELF.fetch("http://example.com/portal/me/locations", {
				method: "POST",
				headers: { authorization: `Bearer ${registered.token}` }
			});
			locations.push((await response.json<{ location: { id: number } }>()).location);
		}

		const lines = [];
		for (const [index, location] of locations.entries()) {
			const response = await SELF.fetch(
				`http://example.com/portal/me/locations/${location.id}/protected-lines`,
				{
					method: "POST",
					headers: {
						"content-type": "application/json",
						authorization: `Bearer ${registered.token}`
					},
					body: JSON.stringify({
						protectedPhoneNumber: `+1800555810${index}`,
						callerFacingBusinessName: `Exact Phrase ${index + 1}`,
						carrier: `Carrier ${index + 1}`
					})
				}
			);
			lines.push((await response.json<{ protectedLine: { id: number } }>()).protectedLine);
		}

		for (let index = 0; index < 2; index += 1) {
			await env.nomorescamcalls_db.prepare(`
				INSERT INTO screening_number_inventory (phone_number, status)
				VALUES (?, 'available')
			`).bind(`+1800555820${index}`).run();
			await env.nomorescamcalls_db.prepare(`
				INSERT INTO sip_credential_inventory (sip_username, status)
				VALUES (?, 'available')
			`).bind(`test_user_beta_flow_${index}`).run();
		}

		const provisioningResults = [];
		for (const line of lines) {
			const response = await SELF.fetch(
				`http://example.com/portal/me/protected-lines/${line.id}/provision`,
				{
					method: "POST",
					headers: { authorization: `Bearer ${registered.token}` }
				}
			);
			expect(response.status).toBe(200);
			const body = await response.json<any>();
			expect(JSON.stringify(body)).not.toContain("sipUsername");
			expect(body.provisioning).toMatchObject({
				provisioningStatus: "provisioned",
				coverageStatus: "inactive",
				protectedLine: {
					forwardingStatus: "awaiting_confirmation",
					coverageStatus: "inactive"
				},
				delivery: {
					channel: "sms",
					destination: "+18005558030",
					status: "provider_unavailable"
				}
			});
			expect(body.provisioning.forwardingInstructions.instructions)
				.toContain(body.provisioning.protectedLine.protectedPhoneNumber);
			expect(body.provisioning.forwardingInstructions.instructions)
				.toContain(body.provisioning.protectedLine.screeningNumber);
			provisioningResults.push(body.provisioning);
		}
		expect(provisioningResults[0].protectedLine.screeningNumber)
			.not.toBe(provisioningResults[1].protectedLine.screeningNumber);
		const provisionedResources = await env.nomorescamcalls_db
			.prepare(`
				SELECT id, screening_number, sip_username
				FROM protected_lines
				WHERE id IN (?, ?)
				ORDER BY id ASC
			`)
			.bind(lines[0].id, lines[1].id)
			.all<{
				id: number;
				screening_number: string;
				sip_username: string;
			}>();
		expect(provisionedResources.results).toHaveLength(2);
		expect(provisionedResources.results[0].screening_number)
			.not.toBe(provisionedResources.results[1].screening_number);
		expect(provisionedResources.results[0].sip_username)
			.not.toBe(provisionedResources.results[1].sip_username);

		const idempotent = await SELF.fetch(
			`http://example.com/portal/me/protected-lines/${lines[0].id}/provision`,
			{
				method: "POST",
				headers: { authorization: `Bearer ${registered.token}` }
			}
		);
		expect(await idempotent.json()).toMatchObject({
			provisioning: {
				provisioningStatus: "already_provisioned",
				coverageStatus: "inactive"
			}
		});

		const confirmation = await SELF.fetch(
			`http://example.com/portal/me/protected-lines/${lines[0].id}/forwarding-confirm`,
			{
				method: "POST",
				headers: { authorization: `Bearer ${registered.token}` }
			}
		);
		expect(await confirmation.json()).toMatchObject({
			forwardingConfirmed: true,
			coverageActive: true,
			protectedLine: {
				id: lines[0].id,
				forwardingStatus: "confirmed",
				coverageStatus: "active",
				activatedAt: expect.any(String)
			}
		});
		expect(await env.nomorescamcalls_db
			.prepare(`
				SELECT forwarding_status, coverage_status
				FROM protected_lines
				WHERE id = ?
			`)
			.bind(lines[1].id)
			.first()).toEqual({
			forwarding_status: "awaiting_confirmation",
			coverage_status: "inactive"
		});
	});

	it("records provider failure rather than claiming successful delivery", async () => {
		const result = await issueBetaInvitation(
			env.nomorescamcalls_db,
			administrator,
			{ email: "provider-failure@example.com" },
			{
				provider: {
					name: "test-failing-provider",
					async send() {
						throw new Error("Synthetic provider failure");
					}
				}
			}
		);
		expect(result.delivery).toMatchObject({
			status: "failed",
			provider: "test-failing-provider",
			failureReason: "Synthetic provider failure",
			sentAt: null
		});
	});
});
