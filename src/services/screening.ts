export type ScreeningDecision = "allow" | "block";

export interface ScreeningResult {
	phoneNumber: string;
	decision: ScreeningDecision;
	score: number;
	reason: string;
}

const ALLOW_LIST = [
	"+19135551234"
];

const BLOCK_LIST = [
	"+15555555555",
	"+18888888888"
];

function calculateRiskScore(phoneNumber: string): {
	score: number;
	reason: string;
} {
	if (ALLOW_LIST.includes(phoneNumber)) {
		return {
			score: 0,
			reason: "allow_list"
		};
	}

	if (BLOCK_LIST.includes(phoneNumber)) {
		return {
			score: 95,
			reason: "block_list"
		};
	}

	return {
		score: 5,
		reason: "not_found"
	};
}

export function screenPhoneNumber(phoneNumber: string): ScreeningResult {
	const { score, reason } = calculateRiskScore(phoneNumber);

	return {
		phoneNumber,
		decision: score >= 80 ? "block" : "allow",
		score,
		reason
	};
}