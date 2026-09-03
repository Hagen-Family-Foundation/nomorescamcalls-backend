import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import {
	acceptCurrentBetaAgreement,
	CURRENT_BETA_AGREEMENT,
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

	it("exposes one complete current agreement authority", () => {
		const agreement = getCurrentBetaAgreement();

		expect(agreement).toBe(CURRENT_BETA_AGREEMENT);
		expect(agreement.version).toBe("v1");
		expect(agreement.title).toBe(
			"NoMoreScamCalls Beta Participation Agreement"
		);
		expect(agreement.effectiveAt).toBe("2026-07-19T00:00:00Z");
		expect(agreement.preamble.length).toBeGreaterThan(0);
		expect(agreement.sections).toHaveLength(12);
		expect(agreement.acceptance.length).toBeGreaterThan(0);
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

		expect(stored?.agreement_version).toBe(
			CURRENT_BETA_AGREEMENT.version
		);
		expect(stored?.accepted_at).toBe(firstAcceptance?.acceptedAt);
		expect(stored?.acceptance_count).toBe(1);
	});
});
