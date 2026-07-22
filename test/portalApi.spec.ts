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

		expect(await agreementResponse.json()).toMatchObject({
			accepted: true,
			agreement: {
				version: 'v1',
			},
		});

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
