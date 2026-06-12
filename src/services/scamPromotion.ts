export interface ScamPromotionInput {
	phoneNumber: string;
	reason: string;
	evidenceLevel?: string;
	riskScore?: number;
}

export async function promoteConfirmedScamNumber(
	db: D1Database,
	input: ScamPromotionInput
): Promise<void> {
	const evidenceLevel = input.evidenceLevel ?? "high";
	const riskScore = input.riskScore ?? 95;

	await db
		.prepare(`
			INSERT INTO confirmed_scam_numbers (
				caller_number,
				reason,
				evidence_level,
				risk_score,
				attempt_count
			)
			VALUES (?, ?, ?, ?, 1)
			ON CONFLICT(caller_number) DO UPDATE SET
				reason = excluded.reason,
				evidence_level = excluded.evidence_level,
				risk_score = excluded.risk_score,
				attempt_count = confirmed_scam_numbers.attempt_count + 1,
				last_seen = CURRENT_TIMESTAMP
		`)
		.bind(
			input.phoneNumber,
			input.reason,
			evidenceLevel,
			riskScore
		)
		.run();
}
