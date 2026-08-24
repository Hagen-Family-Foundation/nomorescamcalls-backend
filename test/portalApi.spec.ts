import { env, SELF } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { ensureTestSchema } from './testSchema';

describe('subscriber portal API', () => {
	beforeAll(async () => {
		await ensureTestSchema();
	});

	it('completes invite, registration, session, agreement, and logout', async () => {
		const inviteCode = 'PORTAL-INTEGRATION-ONE';

		await env.nomorescamcalls_db
			.prepare(
				`
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
			`,
			)
			.bind(inviteCode)
			.run();

		const validateResponse = await SELF.fetch('http://example.com/portal/invite-codes/validate', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
			},
			body: JSON.stringify({
				code: inviteCode,
			}),
		});

		expect(validateResponse.status).toBe(200);
		expect(await validateResponse.json()).toMatchObject({
			valid: true,
			code: inviteCode,
		});

		const registerResponse = await SELF.fetch('http://example.com/portal/auth/register', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
			},
			body: JSON.stringify({
				code: inviteCode,
				firstName: 'Portal',
				lastName: 'Participant',
				callerFacingBusinessName: 'Portal Plumbing',
				email: 'portal.integration@example.com',
				phoneNumber: '+15550001020',
				carrier: 'Example Carrier',
				contactMethod: 'email',
				password: 'portal-password',
			}),
		});

		expect(registerResponse.status).toBe(201);

		const registerBody = await registerResponse.json<{
			token: string;
			user: {
				id: number;
				email: string;
			};
		}>();

		expect(registerBody.token.length).toBeGreaterThan(20);

		expect(registerBody.user.email).toBe('portal.integration@example.com');
		expect((registerBody.user as any).callerFacingBusinessName).toBe('Portal Plumbing');

		const meResponse = await SELF.fetch('http://example.com/portal/me', {
			headers: {
				authorization: `Bearer ${registerBody.token}`,
			},
		});

		expect(meResponse.status).toBe(200);

		const meBody = await meResponse.json<{
			user: {
				email: string;
				agreementAccepted: boolean;
			};
		}>();

		expect(meBody.user.email).toBe('portal.integration@example.com');

		expect(meBody.user.agreementAccepted).toBe(false);

		await env.nomorescamcalls_db
			.prepare(
				`
					INSERT INTO screening_number_inventory (
						phone_number,
						status,
						provider,
						provider_number_id,
						voice_application_id,
						connection_id,
						last_synced_at
					)
					VALUES (?, 'available', 'telnyx', ?, ?, ?, CURRENT_TIMESTAMP)
					ON CONFLICT(phone_number) DO UPDATE SET
						status = 'available',
						assigned_user_id = NULL,
						assigned_at = NULL,
						provider = excluded.provider,
						provider_number_id = excluded.provider_number_id,
						voice_application_id = excluded.voice_application_id,
						connection_id = excluded.connection_id,
						last_synced_at = CURRENT_TIMESTAMP
				`,
			)
			.bind(
				'+15550002020',
				'portal-number-id',
				'portal-voice-application-id',
				'portal-call-control-connection-id',
			)
			.run();

		await env.nomorescamcalls_db
			.prepare(
				`
					INSERT INTO sip_credential_inventory (
						sip_username,
						status,
						provider,
						provider_credential_id,
						connection_id,
						last_synced_at
					)
					VALUES (?, 'available', 'telnyx', ?, ?, CURRENT_TIMESTAMP)
					ON CONFLICT(sip_username) DO UPDATE SET
						status = 'available',
						assigned_user_id = NULL,
						assigned_at = NULL,
						provider = excluded.provider,
						provider_credential_id = excluded.provider_credential_id,
						connection_id = excluded.connection_id,
						last_synced_at = CURRENT_TIMESTAMP
				`,
			)
			.bind(
				'portal_integration_user',
				'portal-credential-id',
				'portal-credential-connection-id',
			)
			.run();

		const agreementResponse = await SELF.fetch('http://example.com/portal/agreement/accept', {
			method: 'POST',
			headers: {
				authorization: `Bearer ${registerBody.token}`,
				'content-type': 'application/json',
			},
			body: JSON.stringify({
				version: 'v1',
			}),
		});

		expect(agreementResponse.status).toBe(200);

		const agreementBody = await agreementResponse.json<{
			accepted: boolean;
			agreement: {
				version: string;
			};
			provisioning: {
				status: string;
				coverageStatus: string;
				screeningNumber: string | null;
				sipUsername: string | null;
			};
		}>();

		expect(agreementBody).toMatchObject({
			accepted: true,
			agreement: {
				version: 'v1',
			},
			provisioning: {
				status: 'active',
				coverageStatus: 'active',
				screeningNumber: '+15550002020',
				sipUsername: 'portal_integration_user',
			},
		});

		const provisionedUser = await env.nomorescamcalls_db
			.prepare(
				`
					SELECT
						screening_number,
						sip_username,
						coverage_status
					FROM users
					WHERE id = ?
				`,
			)
			.bind(registerBody.user.id)
			.first<{
				screening_number: string | null;
				sip_username: string | null;
				coverage_status: string;
			}>();

		expect(provisionedUser).toEqual({
			screening_number: '+15550002020',
			sip_username: 'portal_integration_user',
			coverage_status: 'active',
		});

		const callResponse = await SELF.fetch('http://example.com/webhooks/telnyx', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
			},
			body: JSON.stringify({
				data: {
					event_type: 'call.initiated',
					payload: {
						call_control_id: 'portal-provisioned-control',
						call_session_id: 'portal-provisioned-session',
						from: '+18005551220',
						to: '+15550002020',
					},
				},
			}),
		});
		const callBody = await callResponse.json<{
			protectedUser: { id: number };
			firstRequest: { body: { payload: string } };
		}>();

		expect(callResponse.status).toBe(200);
		expect(callBody.protectedUser.id).toBe(registerBody.user.id);
		expect(callBody.firstRequest.body.payload).toContain(
			'Thank you for calling Portal Plumbing.'
		);

		const logoutResponse = await SELF.fetch('http://example.com/portal/auth/logout', {
			method: 'POST',
			headers: {
				authorization: `Bearer ${registerBody.token}`,
			},
		});

		expect(logoutResponse.status).toBe(200);

		const rejectedSession = await SELF.fetch('http://example.com/portal/me', {
			headers: {
				authorization: `Bearer ${registerBody.token}`,
			},
		});

		expect(rejectedSession.status).toBe(401);
	});

	it('rejects an unavailable invitation code', async () => {
		const response = await SELF.fetch('http://example.com/portal/invite-codes/validate', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
			},
			body: JSON.stringify({
				code: 'PORTAL-NOT-AVAILABLE',
			}),
		});

		expect(response.status).toBe(404);

		expect(await response.json()).toMatchObject({
			valid: false,
		});
	});

	it('answers portal browser preflight requests', async () => {
		const response = await SELF.fetch('http://example.com/portal/auth/login', {
			method: 'OPTIONS',
		});

		expect(response.status).toBe(204);

		expect(response.headers.get('access-control-allow-origin')).toBe('*');
	});
});
