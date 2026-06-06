export type ScreeningDecision = "allow" | "block";

export interface ScreeningResult {
	phoneNumber: string;
	decision: ScreeningDecision;
	score: number;
	reason: string;
}

export async function screenPhoneNumber(
	phoneNumber: string,
	db: D1Database
): Promise<ScreeningResult> {
	const allowed = await db
		.prepare(
			"SELECT reason FROM allow_list WHERE phone_number = ?"
		)
		.bind(phoneNumber)
		.first<{ reason: string }>();

	if (allowed) {
		return {
			phoneNumber,
			decision: "allow",
			score: 0,
			reason: allowed.reason
		};
	}

	const blocked = await db
		.prepare(
			"SELECT reason FROM block_list WHERE phone_number = ?"
		)
		.bind(phoneNumber)
		.first<{ reason: string }>();

	if (blocked) {
		return {
			phoneNumber,
			decision: "block",
			score: 95,
			reason: blocked.reason
		};
	}

	return {
		phoneNumber,
		decision: "allow",
		score: 5,
		reason: "not_found"
	};
}