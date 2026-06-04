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

export function screenPhoneNumber(phoneNumber: string): ScreeningResult {
	if (ALLOW_LIST.includes(phoneNumber)) {
		return {
			phoneNumber,
			decision: "allow",
			score: 0,
			reason: "allow_list"
		};
	}

	if (BLOCK_LIST.includes(phoneNumber)) {
		return {
			phoneNumber,
			decision: "block",
			score: 95,
			reason: "block_list"
		};
	}

	return {
		phoneNumber,
		decision: "allow",
		score: 5,
		reason: "not_found"
	};
}