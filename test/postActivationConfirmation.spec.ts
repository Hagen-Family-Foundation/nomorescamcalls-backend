import { env } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import { acceptCurrentBetaAgreement } from "../src/services/betaAgreement";
import {
	initiatePostActivationConfirmation,
	POST_ACTIVATION_CONFIRMATION_MESSAGE,
	type PostActivationConfirmationConfig
} from "../src/services/postActivationConfirmation";
import {
	createAccountLocation,
	createProtectedLine,
	confirmProtectedLineForwarding,
	findProtectedLineById,
	toCustomerProtectedLine
} from "../src/services/protectedLines";
import { provisionProtectedLine } from "../src/services/provisioning";
import { addReadySystemNumber } from "./systemNumberFixtures";
import { addSipCredentialToInventory } from "../src/services/sipCredentialInventory";
import { refreshSubscriberOnboardingStatus } from "../src/services/subscriberOnboarding";
import { createUser } from "../src/services/users";
import { ensureTestSchema } from "./testSchema";

const TELNYX_CONFIG: PostActivationConfirmationConfig = {
	apiKey: "synthetic-telnyx-key",
	baseUrl: "https://api.telnyx.test/v2",
	liveExecution: "true",
	callControlApplicationId: "synthetic-call-control-connection"
};

let sequence = 0;

async function createProvisionedFixture() {
	sequence += 1;
	const suffix = sequence.toString().padStart(3, "0");
	const contactPhoneNumber = `+1800610${suffix}`;
	const protectedPhoneNumber = `+1800620${suffix}`;
	const systemNumber = `+1800630${suffix}`;
	const account = await createUser(env.nomorescamcalls_db, {
		firstName: "Activation",
		lastName: "Customer",
		email: `activation-${suffix}@example.com`,
		contactPhoneNumber,
		contactMethod: "phone",
		passwordHash: "synthetic-password-hash",
		role: "participant"
	});
	await acceptCurrentBetaAgreement(env.nomorescamcalls_db, account.id);
	await refreshSubscriberOnboardingStatus(env.nomorescamcalls_db, account.id);
	const location = await createAccountLocation(env.nomorescamcalls_db, account.id);
	const line = await createProtectedLine(
		env.nomorescamcalls_db,
		account.id,
		location.id,
		{
			protectedPhoneNumber,
			callerFacingBusinessName: `Activation Line ${suffix}`,
			carrier: "Synthetic Carrier"
		}
	);
	await addReadySystemNumber(systemNumber);
	await addSipCredentialToInventory(
		env.nomorescamcalls_db,
		`activation_sip_${suffix}`
	);
	await provisionProtectedLine(env.nomorescamcalls_db, line.id);

	return {
		account,
		line,
		contactPhoneNumber,
		protectedPhoneNumber,
		systemNumber
	};
}

function telnyxBody(fetchMock: ReturnType<typeof vi.fn>, index: number) {
	const init = fetchMock.mock.calls[index]?.[1] as RequestInit | undefined;
	return JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
}

function dispatchWebhook(payload: unknown): Promise<Response> {
	return worker.fetch(
		new Request("http://example.com/webhooks/telnyx", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(payload)
		}),
		{
			...env,
			TELNYX_API_KEY: TELNYX_CONFIG.apiKey,
			TELNYX_API_BASE_URL: TELNYX_CONFIG.baseUrl,
			TELNYX_LIVE_EXECUTION: "true",
			TELNYX_CALL_CONTROL_APPLICATION_ID: TELNYX_CONFIG.callControlApplicationId
		} as Env
	);
}

describe("post-activation onboarding confirmation", () => {
	beforeAll(async () => {
		await ensureTestSchema();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("dials the account contact once, speaks after answer, and completes once", async () => {
		const fixture = await createProvisionedFixture();
		await confirmProtectedLineForwarding(
			env.nomorescamcalls_db,
			fixture.account.id,
			fixture.line.id
		);

		const telnyxFetch = vi.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify({
				data: { call_control_id: "activation-call-control" }
			}), { status: 200 }))
			.mockResolvedValueOnce(new Response(JSON.stringify({ data: {} }), { status: 200 }))
			.mockResolvedValueOnce(new Response(JSON.stringify({ data: {} }), { status: 200 }));
		vi.stubGlobal("fetch", telnyxFetch);

		const initiated = await initiatePostActivationConfirmation(
			env.nomorescamcalls_db,
			fixture.account.id,
			fixture.line.id,
			TELNYX_CONFIG
		);
		expect(initiated.status).toBe("initiated");
		expect(telnyxFetch).toHaveBeenCalledTimes(1);
		expect(String(telnyxFetch.mock.calls[0]?.[0])).toBe(
			"https://api.telnyx.test/v2/calls"
		);
		const dialBody = telnyxBody(telnyxFetch, 0);
		expect(dialBody).toMatchObject({
			connection_id: TELNYX_CONFIG.callControlApplicationId,
			to: fixture.contactPhoneNumber,
			from: fixture.systemNumber,
			from_display_name: "NoMoreScamCalls"
		});
		expect(dialBody.to).not.toBe(fixture.protectedPhoneNumber);
		expect(typeof dialBody.client_state).toBe("string");

		await expect(initiatePostActivationConfirmation(
			env.nomorescamcalls_db,
			fixture.account.id,
			fixture.line.id,
			TELNYX_CONFIG
		)).resolves.toMatchObject({ status: "initiated" });
		expect(telnyxFetch).toHaveBeenCalledTimes(1);

		const webhook = (eventType: string) => ({
			data: {
				event_type: eventType,
				payload: {
					call_control_id: "activation-call-control",
					client_state: dialBody.client_state,
					direction: "outgoing"
				}
			}
		});
		const answered = await dispatchWebhook(webhook("call.answered"));
		expect(answered.status).toBe(200);
		expect(telnyxFetch).toHaveBeenCalledTimes(2);
		expect(String(telnyxFetch.mock.calls[1]?.[0])).toBe(
			"https://api.telnyx.test/v2/calls/activation-call-control/actions/speak"
		);
		expect(telnyxBody(telnyxFetch, 1)).toMatchObject({
			payload: POST_ACTIVATION_CONFIRMATION_MESSAGE,
			language: "en-US",
			voice: "female",
			client_state: dialBody.client_state
		});

		await dispatchWebhook(webhook("call.answered"));
		expect(telnyxFetch).toHaveBeenCalledTimes(2);

		await dispatchWebhook(webhook("call.speak.ended"));
		expect(telnyxFetch).toHaveBeenCalledTimes(3);
		expect(String(telnyxFetch.mock.calls[2]?.[0])).toBe(
			"https://api.telnyx.test/v2/calls/activation-call-control/actions/hangup"
		);

		const completed = await findProtectedLineById(
			env.nomorescamcalls_db,
			fixture.line.id
		);
		expect(completed).toMatchObject({
			coverageStatus: "active",
			forwardingStatus: "confirmed",
			activationConfirmationCallStatus: "completed",
			activationConfirmationCallControlId: "activation-call-control"
		});
		expect(toCustomerProtectedLine(completed!)).not.toHaveProperty(
			"activationConfirmationCallControlId"
		);
	});

	it("keeps activation and sibling state intact when the call cannot be placed", async () => {
		const fixture = await createProvisionedFixture();
		const location = await createAccountLocation(
			env.nomorescamcalls_db,
			fixture.account.id
		);
		const sibling = await createProtectedLine(
			env.nomorescamcalls_db,
			fixture.account.id,
			location.id,
			{
				protectedPhoneNumber: `+1800640${sequence.toString().padStart(3, "0")}`,
				callerFacingBusinessName: "Inactive Sibling"
			}
		);
		await confirmProtectedLineForwarding(
			env.nomorescamcalls_db,
			fixture.account.id,
			fixture.line.id
		);

		const telnyxFetch = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ errors: [{ detail: "synthetic failure" }] }), {
				status: 422
			})
		);
		vi.stubGlobal("fetch", telnyxFetch);

		await expect(initiatePostActivationConfirmation(
			env.nomorescamcalls_db,
			fixture.account.id,
			fixture.line.id,
			TELNYX_CONFIG
		)).resolves.toMatchObject({ status: "failed" });
		await initiatePostActivationConfirmation(
			env.nomorescamcalls_db,
			fixture.account.id,
			fixture.line.id,
			TELNYX_CONFIG
		);
		expect(telnyxFetch).toHaveBeenCalledTimes(1);

		expect(await findProtectedLineById(
			env.nomorescamcalls_db,
			fixture.line.id
		)).toMatchObject({
			coverageStatus: "active",
			forwardingStatus: "confirmed",
			activationConfirmationCallStatus: "failed"
		});
		expect(await findProtectedLineById(
			env.nomorescamcalls_db,
			sibling.id
		)).toMatchObject({
			coverageStatus: "inactive",
			forwardingStatus: "not_started",
			activationConfirmationCallStatus: "not_started"
		});
	});
});
