import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import {
	acceptCurrentBetaAgreement,
	getCurrentBetaAgreement,
	hasAcceptedCurrentBetaAgreement
} from "../src/services/betaAgreement";
import { ensureTestSchema } from "./testSchema";

async function createParticipant(
	email: string,
	phoneNumber: string
): Promise<number> {
	const result = await env.nomorescamcalls_db
		.prepare(`
			INSERT INTO users (
				first_name,
				last_name,
				email,
				phone_number,
				role,
				account_status,
				setup_status,
				status,
				coverage_status
			)
			VALUES (
				'Agreement',
				'Participant',
				?,
				?,
				'participant',
				'active',
				'onboarding_incomplete',
				'active',
				'inactive'
			)
		`)
		.bind(email, phoneNumber)
		.run();

	return Number(result.meta.last_row_id);
}

describe("beta agreement service", () => {
	beforeAll(async () => {
		await ensureTestSchema();
	});

	it("loads the active beta agreement", async () => {
		const agreement = await getCurrentBetaAgreement(
			env.nomorescamcalls_db
		);

		expect(agreement).toEqual({
			version: "v1",
			title: "NoMoreScamCalls Beta Participant Agreement",
			contentHash:
				"2bfdc5f3f56f6b767d981bb6ed6dd2a14f8852704f0afaf20090b50320162c84",
			effectiveAt: "2026-07-19T00:00:00Z"
		});
	});

	it("reports whether the participant accepted the current agreement", async () => {
		const userId = await createParticipant(
			"agreement-status@example.com",
			"+15550001008"
		);

		expect(
			await hasAcceptedCurrentBetaAgreement(
				env.nomorescamcalls_db,
				userId
			)
		).toBe(false);

		await acceptCurrentBetaAgreement(
			env.nomorescamcalls_db,
			userId
		);

		expect(
			await hasAcceptedCurrentBetaAgreement(
				env.nomorescamcalls_db,
				userId
			)
		).toBe(true);
	});

	it("records the current agreement acceptance only once", async () => {
		const userId = await createParticipant(
			"agreement-accept@example.com",
			"+15550001009"
		);

		const firstAcceptance = await acceptCurrentBetaAgreement(
			env.nomorescamcalls_db,
			userId
		);

		const secondAcceptance = await acceptCurrentBetaAgreement(
			env.nomorescamcalls_db,
			userId
		);

		expect(firstAcceptance).not.toBeNull();
		expect(secondAcceptance).toEqual(firstAcceptance);

		const stored = await env.nomorescamcalls_db
			.prepare(`
				SELECT
					agreement_version,
					accepted_at,
					COUNT(*) AS acceptance_count
				FROM beta_agreement_acceptances
				WHERE user_id = ?
				GROUP BY agreement_version, accepted_at
			`)
			.bind(userId)
			.first<{
				agreement_version: string;
				accepted_at: string;
				acceptance_count: number;
			}>();

		expect(stored?.agreement_version).toBe("v1");
		expect(stored?.accepted_at).toBe(firstAcceptance?.acceptedAt);
		expect(stored?.acceptance_count).toBe(1);
	});
});
