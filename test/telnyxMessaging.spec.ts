import { env, SELF } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { acceptCurrentBetaAgreement } from "../src/services/betaAgreement";
import {
	createAccountLocation,
	createProtectedLine,
	findProtectedLineById
} from "../src/services/protectedLines";
import { provisionProtectedLine } from "../src/services/provisioning";
import { addReadySystemNumber } from "./systemNumberFixtures";
import { addSipCredentialToInventory } from "../src/services/sipCredentialInventory";
import { refreshSubscriberOnboardingStatus } from "../src/services/subscriberOnboarding";
import {
	createTelnyxSmsProvider,
	type TelnyxMessagingConfig
} from "../src/services/telnyxMessaging";
import { createUser } from "../src/services/users";
import { ensureTestSchema } from "./testSchema";

const TELNYX_CONFIG: TelnyxMessagingConfig = {
	apiKey: "test-telnyx-api-key",
	baseUrl: "https://api.telnyx.test/v2",
	liveExecution: "true",
	messagingProfileId: "test-messaging-profile",
	fromNumber: "+18005559000"
};

let sequence = 0;

function nextNumber(): string {
	sequence += 1;
	return `+18005559${sequence.toString().padStart(3, "0")}`;
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

describe("Telnyx forwarding messaging", () => {
	beforeAll(async () => {
		await ensureTestSchema();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("reports provider configuration and delivery failures truthfully", async () => {
		const unavailable = createTelnyxSmsProvider({
			...TELNYX_CONFIG,
			apiKey: undefined
		});
		expect(unavailable.unavailableReason).toContain("TELNYX_API_KEY");

		const disabled = createTelnyxSmsProvider({
			...TELNYX_CONFIG,
			liveExecution: "false"
		});
		expect(disabled.unavailableReason).toContain("TELNYX_LIVE_EXECUTION=true");

		const outbound = mockTelnyxResponses([{
			status: 422,
			body: { errors: [{ detail: "Synthetic invalid destination" }] }
		}]);
		await expect(createTelnyxSmsProvider(TELNYX_CONFIG).send({
			channel: "sms",
			destination: nextNumber(),
			subject: null,
			body: "Synthetic forwarding instructions"
		})).rejects.toThrow("422: Synthetic invalid destination");
		expect(outbound).toHaveBeenCalledTimes(1);
	});

	it("sends distinct exact-line forwarding messages and preserves provider IDs", async () => {
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
			await addReadySystemNumber(nextNumber());
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
			expect(body).toMatchObject({
				from: TELNYX_CONFIG.fromNumber,
				to: smsDestination,
				messaging_profile_id: TELNYX_CONFIG.messagingProfileId
			});
			expect(body.text).toContain(result.protectedLine.protectedPhoneNumber);
			expect(body.text).toContain(result.protectedLine.systemNumber);
			expect(body.text).not.toContain("test_user_");
			expect(result).toMatchObject({
				coverageStatus: "inactive",
				protectedLine: {
					forwardingStatus: "awaiting_confirmation",
					coverageStatus: "inactive"
				},
				delivery: {
					purpose: "forwarding_instructions",
					status: "sent",
					providerMessageId: index === 0
						? "forwarding-message-one"
						: "forwarding-message-two"
				}
			});
		}
		expect((await findProtectedLineById(
			env.nomorescamcalls_db,
			lines[0].id
		))?.coverageStatus).toBe("inactive");

		await provisionProtectedLine(
			env.nomorescamcalls_db,
			lines[0].id,
			{ provider: createTelnyxSmsProvider(TELNYX_CONFIG) }
		);
		expect(outbound).toHaveBeenCalledTimes(2);
	});

	it("keeps messaging events out of the voice normalizer", async () => {
		const response = await SELF.fetch("http://example.com/webhooks/telnyx", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				data: {
					event_type: "message.received",
					payload: { text: "YES" }
				}
			})
		});
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			received: true,
			processed: false,
			reason: "unsupported_telnyx_messaging_event"
		});
	});
});
