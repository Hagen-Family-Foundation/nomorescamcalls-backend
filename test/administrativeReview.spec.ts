import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { loginBetaParticipant } from "../src/services/betaLogin";
import {
	createAccountLocation,
	createProtectedLine,
	type ProtectedLineRecord
} from "../src/services/protectedLines";
import { createUser, type UserRecord } from "../src/services/users";
import { hashPassword } from "../src/utils/passwordHash";
import { ensureTestSchema } from "./testSchema";

interface ReviewLineBody {
	id: number;
	locationId: number;
	protectedPhoneNumber: string;
	callerFacingBusinessName: string;
	carrier: string | null;
	screeningNumber: string | null;
	provisioningStatus: string;
	coverageStatus: string;
	isInitialTarget: boolean;
}

interface ReviewGateBody {
	reviewSession: {
		id: string;
		reviewerUserId: number;
		reviewerRole: string;
		accountUserId: number;
		initialProtectedLineId: number | null;
		startedAt: string;
		endedAt: string | null;
		durationSeconds: number | null;
	};
	family: {
		account: { id: number };
		initialProtectedLineId: number | null;
		protectedLineCount: number;
		locations: Array<{
			id: number;
			protectedLines: ReviewLineBody[];
		}>;
	};
	examinedProtectedLineId?: number | null;
	change?: {
		protectedLineId: number;
		field: string;
		priorValue: string | null;
		resultingValue: string | null;
	};
}

describe("single administrative account-review gate", () => {
	let administrator: UserRecord;
	let participantToken: string;
	let administratorToken: string;
	let secondAdministratorToken: string;
	let customer: UserRecord;
	let unrelatedCustomer: UserRecord;
	let customerLines: ProtectedLineRecord[];
	let unrelatedLine: ProtectedLineRecord;

	beforeAll(async () => {
		await ensureTestSchema();

		administrator = await createUser(env.nomorescamcalls_db, {
			firstName: "Administrative",
			lastName: "Reviewer",
			email: "administrative-reviewer@example.com",
			contactPhoneNumber: "+18005557001",
			contactMethod: "email",
			passwordHash: await hashPassword("admin-review-password"),
			role: "administrator"
		});
		const participant = await createUser(env.nomorescamcalls_db, {
			firstName: "Portal",
			lastName: "Participant",
			email: "review-participant@example.com",
			contactPhoneNumber: "+18005557002",
			contactMethod: "email",
			passwordHash: await hashPassword("participant-password"),
			role: "participant"
		});
		const secondAdministrator = await createUser(env.nomorescamcalls_db, {
			firstName: "Second",
			lastName: "Reviewer",
			email: "second-administrative-reviewer@example.com",
			contactPhoneNumber: "+18005557005",
			contactMethod: "email",
			passwordHash: await hashPassword("second-admin-review-password"),
			role: "admin"
		});
		customer = await createUser(env.nomorescamcalls_db, {
			firstName: "Four",
			lastName: "Line Customer",
			email: "four-line-customer@example.com",
			contactPhoneNumber: "+18005557003",
			contactMethod: "email",
			role: "subscriber"
		});
		unrelatedCustomer = await createUser(env.nomorescamcalls_db, {
			firstName: "Unrelated",
			lastName: "Customer",
			email: "unrelated-review-customer@example.com",
			contactPhoneNumber: "+18005557004",
			contactMethod: "email",
			role: "subscriber"
		});

		const administratorLogin = await loginBetaParticipant(
			env.nomorescamcalls_db,
			administrator.email ?? "",
			"admin-review-password"
		);
		const participantLogin = await loginBetaParticipant(
			env.nomorescamcalls_db,
			participant.email ?? "",
			"participant-password"
		);
		const secondAdministratorLogin = await loginBetaParticipant(
			env.nomorescamcalls_db,
			secondAdministrator.email ?? "",
			"second-admin-review-password"
		);
		if (
			!administratorLogin
			|| !participantLogin
			|| !secondAdministratorLogin
		) {
			throw new Error("Failed to create administrative review test sessions");
		}
		administratorToken = administratorLogin.sessionToken;
		participantToken = participantLogin.sessionToken;
		secondAdministratorToken = secondAdministratorLogin.sessionToken;

		const firstLocation = await createAccountLocation(
			env.nomorescamcalls_db,
			customer.id
		);
		const secondLocation = await createAccountLocation(
			env.nomorescamcalls_db,
			customer.id
		);
		customerLines = [
			await createProtectedLine(
				env.nomorescamcalls_db,
				customer.id,
				firstLocation.id,
				{
					protectedPhoneNumber: "+18005557101",
					callerFacingBusinessName: "First Exact Phrase",
					carrier: "Carrier One"
				}
			),
			await createProtectedLine(
				env.nomorescamcalls_db,
				customer.id,
				firstLocation.id,
				{
					protectedPhoneNumber: "+18005557102",
					callerFacingBusinessName: "Second Exact Phrase",
					carrier: "Carrier Two"
				}
			),
			await createProtectedLine(
				env.nomorescamcalls_db,
				customer.id,
				secondLocation.id,
				{
					protectedPhoneNumber: "+18005557103",
					callerFacingBusinessName: "Third Exact Phrase",
					carrier: "Carrier Three"
				}
			),
			await createProtectedLine(
				env.nomorescamcalls_db,
				customer.id,
				secondLocation.id,
				{
					protectedPhoneNumber: "+18005557104",
					callerFacingBusinessName: "Fourth Exact Phrase",
					carrier: "Carrier Four"
				}
			)
		];

		await env.nomorescamcalls_db.batch([
			env.nomorescamcalls_db.prepare(`
				UPDATE protected_lines
				SET screening_number = '+18005557201',
					sip_username = 'review_line_one',
					provisioning_status = 'provisioned',
					coverage_status = 'active'
				WHERE id = ?
			`).bind(customerLines[0].id),
			env.nomorescamcalls_db.prepare(`
				UPDATE protected_lines
				SET provisioning_status = 'failed',
					coverage_status = 'inactive'
				WHERE id = ?
			`).bind(customerLines[2].id)
		]);

		const unrelatedLocation = await createAccountLocation(
			env.nomorescamcalls_db,
			unrelatedCustomer.id
		);
		unrelatedLine = await createProtectedLine(
			env.nomorescamcalls_db,
			unrelatedCustomer.id,
			unrelatedLocation.id,
			{
				protectedPhoneNumber: "+18005557999",
				callerFacingBusinessName: "Unrelated Exact Phrase",
				carrier: "Unrelated Carrier"
			}
		);
	});

	it("rejects missing authentication and authenticated non-administrative roles", async () => {
		const command = JSON.stringify({
			action: "start",
			identifier: {
				type: "protected_line_id",
				value: customerLines[0].id
			}
		});
		const unauthenticated = await SELF.fetch(
			"http://example.com/admin/review",
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: command
			}
		);
		const unauthorizedRole = await SELF.fetch(
			"http://example.com/admin/review",
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					authorization: `Bearer ${participantToken}`
				},
				body: command
			}
		);

		expect(unauthenticated.status).toBe(401);
		expect(unauthorizedRole.status).toBe(403);
		expect((await env.nomorescamcalls_db
			.prepare("SELECT COUNT(*) AS count FROM administrative_review_sessions")
			.first<{ count: number }>())?.count).toBe(0);
	});

	it("returns the complete four-line, multi-location family and audits one controlled review session", async () => {
		const startResponse = await SELF.fetch(
			"http://example.com/admin/review",
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					authorization: `Bearer ${administratorToken}`
				},
				body: JSON.stringify({
					action: "start",
					identifier: {
						type: "protected_phone_number",
						value: customerLines[1].protectedPhoneNumber
					}
				})
			}
		);

		expect(startResponse.status).toBe(200);
		const startBody = await startResponse.json<ReviewGateBody>();
		const visibleLines = startBody.family.locations.flatMap((location) =>
			location.protectedLines
		);

		expect(startBody.reviewSession).toMatchObject({
			reviewerUserId: administrator.id,
			reviewerRole: "administrator",
			accountUserId: customer.id,
			initialProtectedLineId: customerLines[1].id,
			endedAt: null,
			durationSeconds: null
		});
		expect(startBody.reviewSession.startedAt).toBeTruthy();
		expect(startBody.family.account.id).toBe(customer.id);
		expect(startBody.family.locations).toHaveLength(2);
		expect(startBody.family.protectedLineCount).toBe(4);
		expect(visibleLines).toHaveLength(4);
		expect(startBody.family.locations.map((location) => ({
			id: location.id,
			lineIds: location.protectedLines.map((line) => line.id)
		}))).toEqual([
			{
				id: customerLines[0].locationId,
				lineIds: [customerLines[0].id, customerLines[1].id]
			},
			{
				id: customerLines[2].locationId,
				lineIds: [customerLines[2].id, customerLines[3].id]
			}
		]);
		expect(visibleLines.map((line) => line.protectedPhoneNumber)).toEqual(
			expect.arrayContaining(customerLines.map((line) =>
				line.protectedPhoneNumber
			))
		);
		expect(visibleLines).not.toContainEqual(
			expect.objectContaining({ id: unrelatedLine.id })
		);
		expect(visibleLines.filter((line) => line.isInitialTarget)).toEqual([
			expect.objectContaining({ id: customerLines[1].id })
		]);
		expect(visibleLines.find((line) => line.id === customerLines[0].id))
			.toMatchObject({
				screeningNumber: "+18005557201",
				provisioningStatus: "provisioned",
				coverageStatus: "active"
			});
		expect(visibleLines.find((line) => line.id === customerLines[1].id))
			.toMatchObject({
				screeningNumber: null,
				provisioningStatus: "unprovisioned",
				coverageStatus: "inactive"
			});
		expect(visibleLines.find((line) => line.id === customerLines[2].id))
			.toMatchObject({
				provisioningStatus: "failed",
				coverageStatus: "inactive"
			});
		const storedPasswordHash = await env.nomorescamcalls_db
			.prepare("SELECT password_hash FROM users WHERE id = ?")
			.bind(administrator.id)
			.first<{ password_hash: string }>();
		const serializedFamily = JSON.stringify(startBody.family);
		expect(serializedFamily).not.toContain("review_line_one");
		expect(serializedFamily).not.toContain("sipUsername");
		expect(serializedFamily).not.toContain("passwordHash");
		expect(serializedFamily).not.toContain(storedPasswordHash?.password_hash);

		const storedSession = await env.nomorescamcalls_db
			.prepare(`
				SELECT
					reviewer_user_id,
					reviewer_role,
					account_user_id,
					initial_protected_line_id,
					started_at,
					ended_at
				FROM administrative_review_sessions
				WHERE id = ?
			`)
			.bind(startBody.reviewSession.id)
			.first<{
				reviewer_user_id: number;
				reviewer_role: string;
				account_user_id: number;
				initial_protected_line_id: number | null;
				started_at: string;
				ended_at: string | null;
			}>();
		expect(storedSession).toMatchObject({
			reviewer_user_id: administrator.id,
			reviewer_role: "administrator",
			account_user_id: customer.id,
			initial_protected_line_id: customerLines[1].id,
			ended_at: null
		});
		expect(storedSession?.started_at).toBeTruthy();

		const initialReadEvents = await env.nomorescamcalls_db
			.prepare(`
				SELECT protected_line_id, resource_section, action
				FROM administrative_review_events
				WHERE review_session_id = ?
					AND event_type = 'read'
				ORDER BY id
			`)
			.bind(startBody.reviewSession.id)
			.all<{
				protected_line_id: number | null;
				resource_section: string;
				action: string;
			}>();
		expect(initialReadEvents.results[0]).toEqual({
			protected_line_id: customerLines[1].id,
			resource_section: "account_family",
			action: "review_started"
		});
		expect(initialReadEvents.results.filter((event) =>
			event.action === "visible_in_account_family"
		).map((event) => event.protected_line_id)).toEqual(
			expect.arrayContaining(customerLines.map((line) => line.id))
		);

		const viewResponse = await SELF.fetch(
			"http://example.com/admin/review",
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					authorization: `Bearer ${administratorToken}`
				},
				body: JSON.stringify({
					action: "view",
					reviewSessionId: startBody.reviewSession.id,
					section: "protected_line",
					protectedLineId: customerLines[3].id
				})
			}
		);
		expect(viewResponse.status).toBe(200);
		const viewBody = await viewResponse.json<ReviewGateBody>();
		expect(viewBody.reviewSession.id).toBe(startBody.reviewSession.id);
		expect(viewBody.examinedProtectedLineId).toBe(customerLines[3].id);
		expect(viewBody.family.protectedLineCount).toBe(4);
		expect(viewBody.family.initialProtectedLineId).toBe(customerLines[1].id);
		expect((await env.nomorescamcalls_db
			.prepare(`
				SELECT COUNT(*) AS count
				FROM administrative_review_sessions
				WHERE account_user_id = ?
			`)
			.bind(customer.id)
			.first<{ count: number }>())?.count).toBe(1);
		expect(await env.nomorescamcalls_db
			.prepare(`
				SELECT protected_line_id, resource_section
				FROM administrative_review_events
				WHERE review_session_id = ?
					AND action = 'section_viewed'
			`)
			.bind(startBody.reviewSession.id)
			.first()).toMatchObject({
			protected_line_id: customerLines[3].id,
			resource_section: "protected_line"
		});

		const updateResponse = await SELF.fetch(
			"http://example.com/admin/review",
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					authorization: `Bearer ${administratorToken}`
				},
				body: JSON.stringify({
					action: "update",
					reviewSessionId: startBody.reviewSession.id,
					protectedLineId: customerLines[3].id,
					field: "carrier",
					value: "Updated Carrier Four"
				})
			}
		);
		expect(updateResponse.status).toBe(200);
		const updateBody = await updateResponse.json<ReviewGateBody>();
		expect(updateBody.change).toEqual({
			protectedLineId: customerLines[3].id,
			field: "carrier",
			priorValue: "Carrier Four",
			resultingValue: "Updated Carrier Four",
			changedAt: expect.any(String)
		});
		expect(updateBody.family.protectedLineCount).toBe(4);
		const updatedLines = updateBody.family.locations.flatMap((location) =>
			location.protectedLines
		);
		expect(updatedLines.find((line) => line.id === customerLines[0].id))
			.toMatchObject({
				carrier: "Carrier One",
				screeningNumber: "+18005557201",
				provisioningStatus: "provisioned",
				coverageStatus: "active"
			});
		expect(updatedLines.find((line) => line.id === customerLines[2].id))
			.toMatchObject({
				carrier: "Carrier Three",
				provisioningStatus: "failed",
				coverageStatus: "inactive"
			});

		const writeEvent = await env.nomorescamcalls_db
			.prepare(`
				SELECT
					reviewer_user_id,
					account_user_id,
					protected_line_id,
					field_name,
					prior_value,
					resulting_value
				FROM administrative_review_events
				WHERE review_session_id = ?
					AND event_type = 'write'
			`)
			.bind(startBody.reviewSession.id)
			.first();
		expect(writeEvent).toMatchObject({
			reviewer_user_id: administrator.id,
			account_user_id: customer.id,
			protected_line_id: customerLines[3].id,
			field_name: "carrier",
			prior_value: "Carrier Four",
			resulting_value: "Updated Carrier Four"
		});

		const secretValue = "plaintext-secret-must-not-be-audited";
		const secretResponse = await SELF.fetch(
			"http://example.com/admin/review",
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					authorization: `Bearer ${administratorToken}`
				},
				body: JSON.stringify({
					action: "update",
					reviewSessionId: startBody.reviewSession.id,
					protectedLineId: customerLines[3].id,
					field: "password",
					value: secretValue
				})
			}
		);
		expect(secretResponse.status).toBe(400);
		const allAuditValues = await env.nomorescamcalls_db
			.prepare(`
				SELECT field_name, prior_value, resulting_value
				FROM administrative_review_events
				WHERE review_session_id = ?
			`)
			.bind(startBody.reviewSession.id)
			.all();
		expect(JSON.stringify(allAuditValues.results)).not.toContain(secretValue);
		expect(JSON.stringify(allAuditValues.results)).not.toContain("password");

		const endResponse = await SELF.fetch(
			"http://example.com/admin/review",
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					authorization: `Bearer ${administratorToken}`
				},
				body: JSON.stringify({
					action: "end",
					reviewSessionId: startBody.reviewSession.id
				})
			}
		);
		expect(endResponse.status).toBe(200);
		const endBody = await endResponse.json<{
			reviewSession: ReviewGateBody["reviewSession"];
		}>();
		expect(endBody.reviewSession.endedAt).toBeTruthy();
		expect(endBody.reviewSession.durationSeconds).toEqual(
			expect.any(Number)
		);

		const endedStoredSession = await env.nomorescamcalls_db
			.prepare(`
				SELECT started_at, ended_at
				FROM administrative_review_sessions
				WHERE id = ?
			`)
			.bind(startBody.reviewSession.id)
			.first<{ started_at: string; ended_at: string | null }>();
		expect(endedStoredSession?.started_at).toBeTruthy();
		expect(endedStoredSession?.ended_at).toBeTruthy();
		expect(Date.parse(endedStoredSession?.ended_at ?? "")).toBeGreaterThanOrEqual(
			Date.parse(endedStoredSession?.started_at ?? "")
		);

		const afterEndResponse = await SELF.fetch(
			"http://example.com/admin/review",
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					authorization: `Bearer ${administratorToken}`
				},
				body: JSON.stringify({
					action: "view",
					reviewSessionId: startBody.reviewSession.id,
					section: "account_family"
				})
			}
		);
		expect(afterEndResponse.status).toBe(409);
	});

	it("resolves every supported exact identifier and keeps sessions reviewer-owned", async () => {
		const identifiers = [
			{
				type: "account_id",
				value: customer.id,
				initialProtectedLineId: null
			},
			{
				type: "email",
				value: customer.email,
				initialProtectedLineId: null
			},
			{
				type: "protected_line_id",
				value: customerLines[0].id,
				initialProtectedLineId: customerLines[0].id
			},
			{
				type: "screening_number",
				value: "+18005557201",
				initialProtectedLineId: customerLines[0].id
			}
		];

		for (const identifier of identifiers) {
			const startResponse = await SELF.fetch(
				"http://example.com/admin/review",
				{
					method: "POST",
					headers: {
						"content-type": "application/json",
						authorization: `Bearer ${administratorToken}`
					},
					body: JSON.stringify({
						action: "start",
						identifier: {
							type: identifier.type,
							value: identifier.value
						}
					})
				}
			);
			expect(startResponse.status).toBe(200);
			const startBody = await startResponse.json<ReviewGateBody>();
			expect(startBody.reviewSession).toMatchObject({
				accountUserId: customer.id,
				initialProtectedLineId: identifier.initialProtectedLineId
			});
			expect(startBody.family.protectedLineCount).toBe(4);

			const otherReviewerResponse = await SELF.fetch(
				"http://example.com/admin/review",
				{
					method: "POST",
					headers: {
						"content-type": "application/json",
						authorization: `Bearer ${secondAdministratorToken}`
					},
					body: JSON.stringify({
						action: "view",
						reviewSessionId: startBody.reviewSession.id,
						section: "account_family"
					})
				}
			);
			expect(otherReviewerResponse.status).toBe(404);

			const endResponse = await SELF.fetch(
				"http://example.com/admin/review",
				{
					method: "POST",
					headers: {
						"content-type": "application/json",
						authorization: `Bearer ${administratorToken}`
					},
					body: JSON.stringify({
						action: "end",
						reviewSessionId: startBody.reviewSession.id
					})
				}
			);
			expect(endResponse.status).toBe(200);
		}

		const inexactIdentifierResponse = await SELF.fetch(
			"http://example.com/admin/review",
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					authorization: `Bearer ${administratorToken}`
				},
				body: JSON.stringify({
					action: "start",
					identifier: {
						type: "account_id",
						value: `${customer.id}not-exact`
					}
				})
			}
		);
		expect(inexactIdentifierResponse.status).toBe(400);
		expect(await inexactIdentifierResponse.json()).toMatchObject({
			code: "invalid_review_identifier"
		});
	});

	it("does not expose parallel account or line review roads", async () => {
		const responses = await Promise.all([
			SELF.fetch("http://example.com/admin/review"),
			SELF.fetch(`http://example.com/admin/review/accounts/${customer.id}`),
			SELF.fetch(`http://example.com/admin/review/lines/${customerLines[0].id}`),
			SELF.fetch("http://example.com/users?limit=25")
		]);

		expect(responses.map((response) => response.status)).toEqual([
			404,
			404,
			404,
			404
		]);
	});
});
