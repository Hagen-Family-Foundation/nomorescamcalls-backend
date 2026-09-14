import { env } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
	activateDeviceRegistration,
	authorizeDeviceRegistration,
	issueDeviceTelnyxToken,
	listSelectablePhoneModels,
	resolveActiveSubscriberDestination,
	revokeDeviceRegistration
} from "../src/services/subscriberDelivery";
import { createAccountLocation, createProtectedLine } from "../src/services/protectedLines";
import { createUser } from "../src/services/users";
import { ensureTestSchema } from "./testSchema";

const config = {
	apiKey: "synthetic-api-key",
	baseUrl: "https://api.telnyx.test/v2",
	credentialConnectionId: "subscriber-connection"
};

let sequence = 0;

async function createLine() {
	sequence += 1;
	const suffix = sequence.toString().padStart(3, "0");
	const user = await createUser(env.nomorescamcalls_db, {
		firstName: "Device",
		lastName: "Customer",
		email: `device-${suffix}@example.com`,
		contactPhoneNumber: `+1816555${suffix}`,
		contactMethod: "phone",
		passwordHash: "hash",
		role: "participant"
	});
	await env.nomorescamcalls_db.prepare(`
		UPDATE users SET setup_status = 'onboarding_complete' WHERE id = ?
	`).bind(user.id).run();
	const location = await createAccountLocation(env.nomorescamcalls_db, user.id);
	const line = await createProtectedLine(
		env.nomorescamcalls_db,
		user.id,
		location.id,
		{
			protectedPhoneNumber: `+1913555${suffix}`,
			callerFacingBusinessName: `Device Test ${suffix}`
		}
	);
	return { user, line };
}

function credentialBody(id: string, sipUsername: string) {
	return {
		data: {
			id,
			sip_username: sipUsername,
			sip_password: "must-never-be-stored",
			expired: false,
			expires_at: "2042-01-01T00:00:00.000Z"
		}
	};
}

function providerJwt(value: string): string {
	return `header.${btoa(JSON.stringify({ exp: 2_000_000_000 }))}.${value}`;
}

describe("permanent subscriber delivery foundation", () => {
	beforeAll(async () => {
		await ensureTestSchema();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("publishes a maintained selector contract with a non-blocking Other option", async () => {
		await expect(listSelectablePhoneModels(env.nomorescamcalls_db)).resolves.toContainEqual({
			id: "other-model-not-listed",
			manufacturer: "Other",
			displayName: "Model Not Listed",
			platform: "other",
			releaseYear: null,
			selectable: true
		});
	});

	it("authorizes one device, discards provider secrets, issues JWTs, and activates after verification", async () => {
		const { user, line } = await createLine();
		const fetchMock = vi.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify(
				credentialBody("telephony-credential-1", "gencred-device-1")
			), { status: 201 }));
		vi.stubGlobal("fetch", fetchMock);

		const authorized = await authorizeDeviceRegistration(
			env.nomorescamcalls_db,
			user.id,
			line.id,
			"other-model-not-listed",
			config
		);
		expect(authorized.deviceAuthenticator.length).toBeGreaterThan(20);
		expect(authorized.deviceRegistration).toMatchObject({
			status: "pending",
			providerTelephonyCredentialId: "telephony-credential-1",
			providerSipUsername: "gencred-device-1"
		});
		const stored = await env.nomorescamcalls_db.prepare(`
			SELECT device_authenticator_hash, provider_sip_username
			FROM device_registrations WHERE id = ?
		`).bind(authorized.deviceRegistration.id).first<{
			device_authenticator_hash: string;
			provider_sip_username: string;
		}>();
		expect(stored?.device_authenticator_hash).not.toBe(authorized.deviceAuthenticator);
		expect(JSON.stringify(stored)).not.toContain("must-never-be-stored");

		fetchMock
			.mockResolvedValueOnce(new Response(JSON.stringify(
				credentialBody("telephony-credential-1", "gencred-device-1")
			), { status: 200 }))
			.mockResolvedValueOnce(new Response(providerJwt("device-jwt"), { status: 201 }));
		const initialToken = await issueDeviceTelnyxToken(
			env.nomorescamcalls_db,
			authorized.deviceRegistration.id,
			config,
			{ userId: user.id }
		);
		expect(initialToken.token).toBe(providerJwt("device-jwt"));
		expect(initialToken.expiresAt).toBe("2033-05-18T03:33:20.000Z");

		fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
			credential_type: "telephony_credential",
			credential_username: "gencred-device-1",
			registered: true,
			sip_registration_status: "registered",
			sip_registration_details: {
				last_modified: "2026-09-14T12:00:00.000Z"
			}
		}), { status: 200 }));
		const active = await activateDeviceRegistration(
			env.nomorescamcalls_db,
			user.id,
			authorized.deviceRegistration.id,
			config
		);
		expect(active.status).toBe("active");
		expect(fetchMock).toHaveBeenCalledWith(
			"https://api.telnyx.test/v2/sip_registration_status?credential_type=telephony_credential&username=gencred-device-1",
			expect.objectContaining({ method: "GET" })
		);
		await expect(resolveActiveSubscriberDestination(
			env.nomorescamcalls_db,
			line.id
		)).resolves.toEqual({ sipUsername: "gencred-device-1" });

		fetchMock
			.mockResolvedValueOnce(new Response(JSON.stringify(
				credentialBody("telephony-credential-1", "gencred-device-1")
			), { status: 200 }))
			.mockResolvedValueOnce(new Response(providerJwt("renewed-jwt"), { status: 201 }));
		await expect(issueDeviceTelnyxToken(
			env.nomorescamcalls_db,
			authorized.deviceRegistration.id,
			config,
			{ deviceAuthenticator: authorized.deviceAuthenticator }
		)).resolves.toMatchObject({ token: providerJwt("renewed-jwt") });

		fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
		await expect(revokeDeviceRegistration(
			env.nomorescamcalls_db,
			user.id,
			authorized.deviceRegistration.id,
			config
		)).resolves.toMatchObject({ status: "revoked" });
		expect(fetchMock).toHaveBeenLastCalledWith(
			"https://api.telnyx.test/v2/telephony_credentials/telephony-credential-1",
			expect.objectContaining({ method: "DELETE" })
		);
		await expect(issueDeviceTelnyxToken(
			env.nomorescamcalls_db,
			authorized.deviceRegistration.id,
			config,
			{ deviceAuthenticator: authorized.deviceAuthenticator }
		)).rejects.toMatchObject({ code: "device_registration_not_authorized" });
	});
});
