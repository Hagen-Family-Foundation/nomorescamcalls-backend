import { env } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import { acceptCurrentBetaAgreement } from "../src/services/betaAgreement";
import {
	issueBetaInvitation,
	respondToBetaInvitationBySms
} from "../src/services/betaInvitations";
import {
	createAccountLocation,
	createProtectedLine,
	findProtectedLineById
} from "../src/services/protectedLines";
import { provisionProtectedLine } from "../src/services/provisioning";
import { addScreeningNumberToInventory } from "../src/services/screeningNumberInventory";
import { addSipCredentialToInventory } from "../src/services/sipCredentialInventory";
import { refreshSubscriberOnboardingStatus } from "../src/services/subscriberOnboarding";
import {
	createTelnyxSmsProvider,
	handleTelnyxMessagingWebhook,
	type TelnyxMessagingConfig
} from "../src/services/telnyxMessaging";
import { createUser, type UserRecord } from "../src/services/users";
import { ensureTestSchema } from "./testSchema";

const TELNYX_CONFIG: TelnyxMessagingConfig = {
	apiKey: "test-telnyx-api-key",
	baseUrl: "https://api.telnyx.test/v2",
	liveExecution: "true",
	messagingProfileId: "test-messaging-profile",
	fromNumber: "+18005559000",
	portalOrigin: "https://portal.example.test"
};

let sequence = 0;

function nextNumber(): string {
	sequence += 1;
	return `+18005559${sequence.toString().padStart(3, "0")}`;
}

function messageReceivedPayload(input: {
	from: string;
	text: string;
	to?: string;
	messagingProfileId?: string;
	eventId?: string;
	messageId?: string;
}): unknown {
	return {
		data: {
			event_type: "message.received",
			id: input.eventId ?? `test-event-${sequence}`,
			payload: {
				id: input.messageId ?? `test-message-${sequence}`,
				direction: "inbound",
				type: "SMS",
				messaging_profile_id:
					input.messagingProfileId ?? TELNYX_CONFIG.messagingProfileId,
				from: { phone_number: input.from },
				to: [{ phone_number: input.to ?? TELNYX_CONFIG.fromNumber }],
				text: input.text
			}
		}
	};
}

function mockTelnyxResponses(
	responses: Array<{ status?: number; body: unknown }>
) {
	const outbound = vi.fn(async () => {
		const response = responses.shift();
		if (!response) {
			throw new Error("Unexpected Telnyx request");
		}
		return new Response(JSON.stringify(response.body), {
			status: response.status ?? 200,
			headers: { "content-type": "application/json" }
		});
	});
	vi.stubGlobal("fetch", outbound);
	return outbound;
}

function telnyxRequestBody(outbound: ReturnType<typeof vi.fn>, index = 0) {
	const init = outbound.mock.calls[index]?.[1] as RequestInit | undefined;
	return JSON.parse(String(init?.body ?? "{}")) as {
		from?: string;
		to?: string;
		text?: string;
		messaging_profile_id?: string;
	};
}

describe("Telnyx Messaging beta activation integration", () => {
	let administrator: UserRecord;

	beforeAll(async () => {
		await ensureTestSchema();
		administrator = await createUser(env.nomorescamcalls_db, {
			firstName: "Messaging",
			lastName: "Administrator",
			email: "telnyx-messaging-admin@example.com",
			contactPhoneNumber: nextNumber(),
			contactMethod: "email",
			passwordHash: "stored-test-password-hash",
			role: "administrator"
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("sends the initial invitation to the explicit SMS destination and preserves Telnyx acceptance", async () => {
		const destination = nextNumber();
		const protectedLineLikeNumber = nextNumber();
		const outbound = mockTelnyxResponses([{
			body: { data: { id: "telnyx-initial-message-id", status: "queued" } }
		}]);

		const result = await issueBetaInvitation(
			env.nomorescamcalls_db,
			administrator,
			{
				smsContactNumber: destination,
				smsCapable: true,
				email: "initial-fallback@example.com"
			},
			{ provider: createTelnyxSmsProvider(TELNYX_CONFIG) }
		);

		expect(result.delivery).toMatchObject({
			channel: "sms",
			destination,
			status: "sent",
			provider: "telnyx",
			providerMessageId: "telnyx-initial-message-id"
		});
		const body = telnyxRequestBody(outbound);
		expect(body).toMatchObject({
			from: TELNYX_CONFIG.fromNumber,
			to: destination,
			messaging_profile_id: TELNYX_CONFIG.messagingProfileId
		});
		expect(body.to).not.toBe(protectedLineLikeNumber);
		expect(body.text).toMatch(/reply y or yes/i);
		expect(body.text).not.toContain("BETA-");
		expect(body.text).not.toContain("/portal/onboarding");
	});

	it("maps Telnyx rejection to failed and missing configuration to provider_unavailable without sending email", async () => {
		const outbound = mockTelnyxResponses([{
			status: 422,
			body: {
				errors: [{ detail: "Synthetic invalid destination" }]
			}
		}]);
		const failed = await issueBetaInvitation(
			env.nomorescamcalls_db,
			administrator,
			{ smsContactNumber: nextNumber(), smsCapable: true },
			{ provider: createTelnyxSmsProvider(TELNYX_CONFIG) }
		);
		expect(failed.delivery).toMatchObject({
			status: "failed",
			provider: "telnyx",
			providerMessageId: null,
			sentAt: null
		});
		expect(failed.delivery.failureReason).toContain("422");
		expect(failed.delivery.failureReason).toContain("Synthetic invalid destination");

		const unavailable = await issueBetaInvitation(
			env.nomorescamcalls_db,
			administrator,
			{ smsContactNumber: nextNumber(), smsCapable: true },
			{
				provider: createTelnyxSmsProvider({
					...TELNYX_CONFIG,
					apiKey: undefined
				})
			}
		);
		expect(unavailable.delivery).toMatchObject({
			status: "provider_unavailable",
			provider: "telnyx",
			attemptedAt: null
		});
		expect(unavailable.delivery.failureReason).toContain("TELNYX_API_KEY");

		const disabled = await issueBetaInvitation(
			env.nomorescamcalls_db,
			administrator,
			{ smsContactNumber: nextNumber(), smsCapable: true },
			{
				provider: createTelnyxSmsProvider({
					...TELNYX_CONFIG,
					liveExecution: "false"
				})
			}
		);
		expect(disabled.delivery).toMatchObject({
			status: "provider_unavailable",
			provider: "telnyx",
			attemptedAt: null
		});
		expect(disabled.delivery.failureReason).toContain("TELNYX_LIVE_EXECUTION=true");

		const email = await issueBetaInvitation(
			env.nomorescamcalls_db,
			administrator,
			{ email: `email-${sequence}@example.com` },
			{ provider: createTelnyxSmsProvider(TELNYX_CONFIG) }
		);
		expect(email.delivery).toMatchObject({
			channel: "email",
			status: "provider_unavailable"
		});
		expect(email.delivery.failureReason).toContain("does not support email");
		expect(outbound).toHaveBeenCalledTimes(1);
	});

	it("prevents another active invitation for the same SMS destination after credential issuance", async () => {
		const destination = nextNumber();
		await issueBetaInvitation(
			env.nomorescamcalls_db,
			administrator,
			{ smsContactNumber: destination, smsCapable: true }
		);
		mockTelnyxResponses([{
			body: { data: { id: "credential-before-duplicate-check" } }
		}]);
		await respondToBetaInvitationBySms(
			env.nomorescamcalls_db,
			{ smsContactNumber: destination, response: "YES" },
			{
				provider: createTelnyxSmsProvider(TELNYX_CONFIG),
				portalOrigin: TELNYX_CONFIG.portalOrigin
			}
		);

		await expect(issueBetaInvitation(
			env.nomorescamcalls_db,
			administrator,
			{ smsContactNumber: destination, smsCapable: true }
		)).rejects.toMatchObject({ code: "invitation_already_active" });
	});

	it.each(["Y", "YES", "yEs", "  yes  "])(
		"accepts inbound %j from the invitation owner and sends one full credential URL",
		async (affirmative) => {
			const destination = nextNumber();
			const invitation = await issueBetaInvitation(
				env.nomorescamcalls_db,
				administrator,
				{ smsContactNumber: destination, smsCapable: true }
			);
			const outbound = mockTelnyxResponses([{
				body: { data: { id: `credential-message-${sequence}` } }
			}]);
			const request = new Request("https://worker.example.test/webhooks/telnyx", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(messageReceivedPayload({
					from: destination,
					text: affirmative
				}))
			});
			const response = await worker.fetch(request, {
				...env,
				TELNYX_API_KEY: TELNYX_CONFIG.apiKey,
				TELNYX_API_BASE_URL: TELNYX_CONFIG.baseUrl,
				TELNYX_LIVE_EXECUTION: "true",
				TELNYX_MESSAGING_PROFILE_ID: TELNYX_CONFIG.messagingProfileId,
				TELNYX_MESSAGING_FROM_NUMBER: TELNYX_CONFIG.fromNumber,
				PORTAL_ORIGIN: TELNYX_CONFIG.portalOrigin,
				TELNYX_WEBHOOK_SIGNING_SECRET: undefined
			} as Env);

			expect(response.status).toBe(200);
			expect(await response.json()).toMatchObject({
				received: true,
				processed: true,
				accepted: true,
				invitationId: invitation.invitation.id,
				credentialIssued: true,
				deliveryStatus: "sent"
			});
			const message = telnyxRequestBody(outbound);
			expect(message.to).toBe(destination);
			expect(message.text).toContain("https://portal.example.test/portal/onboarding?invite=BETA-");
			expect(message.text).toMatch(/Invitation key: BETA-/);
			expect((await env.nomorescamcalls_db
				.prepare("SELECT COUNT(*) AS count FROM beta_invite_codes WHERE invitation_id = ?")
				.bind(invitation.invitation.id)
				.first<{ count: number }>())?.count).toBe(1);
		}
	);

	it("ignores non-affirmative, unknown, wrong-context, cancelled, expired, and redeemed inbound messages", async () => {
		const destination = nextNumber();
		const invitation = await issueBetaInvitation(
			env.nomorescamcalls_db,
			administrator,
			{ smsContactNumber: destination, smsCapable: true }
		);
		const outbound = mockTelnyxResponses([]);

		const nonAffirmative = await handleTelnyxMessagingWebhook(
			messageReceivedPayload({ from: destination, text: "Maybe" }),
			env.nomorescamcalls_db,
			TELNYX_CONFIG
		);
		expect(await nonAffirmative.json()).toMatchObject({
			processed: true,
			accepted: false,
			credentialIssued: false
		});
		expect(await env.nomorescamcalls_db
			.prepare("SELECT status FROM beta_invitations WHERE id = ?")
			.bind(invitation.invitation.id)
			.first()).toEqual({ status: "awaiting_response" });

		for (const payload of [
			messageReceivedPayload({ from: nextNumber(), text: "YES" }),
			messageReceivedPayload({ from: destination, text: "YES", to: nextNumber() }),
			messageReceivedPayload({
				from: destination,
				text: "YES",
				messagingProfileId: "wrong-profile"
			})
		]) {
			const response = await handleTelnyxMessagingWebhook(
				payload,
				env.nomorescamcalls_db,
				TELNYX_CONFIG
			);
			expect((await response.json() as { processed: boolean }).processed).toBe(false);
		}

		for (const status of ["cancelled", "expired", "redeemed"] as const) {
			const statusDestination = nextNumber();
			const statusInvitation = await issueBetaInvitation(
				env.nomorescamcalls_db,
				administrator,
				{ smsContactNumber: statusDestination, smsCapable: true }
			);
			await env.nomorescamcalls_db
				.prepare("UPDATE beta_invitations SET status = ? WHERE id = ?")
				.bind(status, statusInvitation.invitation.id)
				.run();
			const response = await handleTelnyxMessagingWebhook(
				messageReceivedPayload({ from: statusDestination, text: "YES" }),
				env.nomorescamcalls_db,
				TELNYX_CONFIG
			);
			expect((await response.json() as { processed: boolean }).processed).toBe(false);
			expect((await env.nomorescamcalls_db
				.prepare("SELECT COUNT(*) AS count FROM beta_invite_codes WHERE invitation_id = ?")
				.bind(statusInvitation.invitation.id)
				.first<{ count: number }>())?.count).toBe(0);
		}
		expect(outbound).not.toHaveBeenCalled();
	});

	it("uses the actual sender's destination ownership and cannot advance another sender's invitation", async () => {
		const firstDestination = nextNumber();
		const secondDestination = nextNumber();
		const firstInvitation = await issueBetaInvitation(
			env.nomorescamcalls_db,
			administrator,
			{ smsContactNumber: firstDestination, smsCapable: true }
		);
		const secondInvitation = await issueBetaInvitation(
			env.nomorescamcalls_db,
			administrator,
			{ smsContactNumber: secondDestination, smsCapable: true }
		);
		mockTelnyxResponses([{
			body: { data: { id: "second-sender-credential-message" } }
		}]);

		const response = await handleTelnyxMessagingWebhook(
			messageReceivedPayload({ from: secondDestination, text: "YES" }),
			env.nomorescamcalls_db,
			TELNYX_CONFIG
		);
		expect(await response.json()).toMatchObject({
			processed: true,
			invitationId: secondInvitation.invitation.id
		});
		expect(await env.nomorescamcalls_db
			.prepare("SELECT status FROM beta_invitations WHERE id = ?")
			.bind(firstInvitation.invitation.id)
			.first()).toEqual({ status: "awaiting_response" });
		expect((await env.nomorescamcalls_db
			.prepare("SELECT COUNT(*) AS count FROM beta_invite_codes WHERE invitation_id = ?")
			.bind(firstInvitation.invitation.id)
			.first<{ count: number }>())?.count).toBe(0);
	});

	it("retries a failed credential SMS with the same one-time key and never creates a second credential", async () => {
		const destination = nextNumber();
		const invitation = await issueBetaInvitation(
			env.nomorescamcalls_db,
			administrator,
			{ smsContactNumber: destination, smsCapable: true }
		);
		const outbound = mockTelnyxResponses([
			{ status: 500, body: { errors: [{ detail: "Synthetic outage" }] } },
			{ body: { data: { id: "credential-retry-id" } } }
		]);
		const input = { smsContactNumber: destination, response: "YES" };
		const first = await respondToBetaInvitationBySms(
			env.nomorescamcalls_db,
			input,
			{
				provider: createTelnyxSmsProvider(TELNYX_CONFIG),
				portalOrigin: TELNYX_CONFIG.portalOrigin
			}
		);
		expect(first.delivery?.status).toBe("failed");
		const second = await respondToBetaInvitationBySms(
			env.nomorescamcalls_db,
			input,
			{
				provider: createTelnyxSmsProvider(TELNYX_CONFIG),
				portalOrigin: TELNYX_CONFIG.portalOrigin
			}
		);
		expect(second.delivery).toMatchObject({
			status: "sent",
			providerMessageId: "credential-retry-id"
		});
		expect(second.credential?.code).toBe(first.credential?.code);
		expect(outbound).toHaveBeenCalledTimes(2);
		expect((await env.nomorescamcalls_db
			.prepare("SELECT COUNT(*) AS count FROM beta_invite_codes WHERE invitation_id = ?")
			.bind(invitation.invitation.id)
			.first<{ count: number }>())?.count).toBe(1);
	});

	it("sends distinct exact-line forwarding SMS messages without activating coverage or exposing SIP resources", async () => {
		const smsDestination = nextNumber();
		const account = await createUser(env.nomorescamcalls_db, {
			firstName: "Forwarding",
			lastName: "Customer",
			email: `forwarding-${sequence}@example.com`,
			contactPhoneNumber: nextNumber(),
			contactMethod: "sms",
			smsContactNumber: smsDestination,
			smsCapable: true,
			passwordHash: "stored-test-password-hash",
			role: "participant"
		});
		await acceptCurrentBetaAgreement(env.nomorescamcalls_db, account.id);
		await refreshSubscriberOnboardingStatus(env.nomorescamcalls_db, account.id);
		const location = await createAccountLocation(env.nomorescamcalls_db, account.id);
		const lines = [];
		for (let index = 0; index < 2; index += 1) {
			lines.push(await createProtectedLine(
				env.nomorescamcalls_db,
				account.id,
				location.id,
				{
					protectedPhoneNumber: nextNumber(),
					callerFacingBusinessName: `Messaging Line ${index + 1}`
				}
			));
			await addScreeningNumberToInventory(
				env.nomorescamcalls_db,
				nextNumber()
			);
			await addSipCredentialToInventory(
				env.nomorescamcalls_db,
				`test_user_messaging_${sequence}_${index}`
			);
		}

		const outbound = mockTelnyxResponses([
			{ body: { data: { id: "forwarding-message-one" } } },
			{ body: { data: { id: "forwarding-message-two" } } }
		]);
		const results = [];
		for (const line of lines) {
			results.push(await provisionProtectedLine(
				env.nomorescamcalls_db,
				line.id,
				{ provider: createTelnyxSmsProvider(TELNYX_CONFIG) }
			));
		}

		expect(outbound).toHaveBeenCalledTimes(2);
		for (const [index, result] of results.entries()) {
			const body = telnyxRequestBody(outbound, index);
			expect(body.to).toBe(smsDestination);
			expect(body.text).toContain(result.protectedLine.protectedPhoneNumber);
			expect(body.text).toContain(result.protectedLine.screeningNumber);
			expect(body.text).not.toContain("test_user_");
			expect(body.text).not.toMatch(/SIP|credential|inventory|Evidence Engine/i);
			expect(result).toMatchObject({
				coverageStatus: "inactive",
				protectedLine: {
					forwardingStatus: "awaiting_confirmation",
					coverageStatus: "inactive"
				},
				delivery: {
					status: "sent",
					providerMessageId: index === 0
						? "forwarding-message-one"
						: "forwarding-message-two"
				}
			});
			expect(result.protectedLine).not.toHaveProperty("sipUsername");
		}
		expect(results[0].protectedLine.screeningNumber)
			.not.toBe(results[1].protectedLine.screeningNumber);
		expect((await findProtectedLineById(env.nomorescamcalls_db, lines[0].id))?.coverageStatus)
			.toBe("inactive");
		expect((await findProtectedLineById(env.nomorescamcalls_db, lines[1].id))?.coverageStatus)
			.toBe("inactive");

		await provisionProtectedLine(
			env.nomorescamcalls_db,
			lines[0].id,
			{ provider: createTelnyxSmsProvider(TELNYX_CONFIG) }
		);
		expect(outbound).toHaveBeenCalledTimes(2);
	});
});
