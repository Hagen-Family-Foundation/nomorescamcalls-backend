import {
	INITIAL_CALL_STANDING,
	type EvidenceDeduction
} from "./types";

export function calculateCurrentStanding(
	deductions: EvidenceDeduction[]
): number {
	const totalDeductions = deductions.reduce((total, deduction) => {
		if (!Number.isFinite(deduction.points) || deduction.points < 0) {
			throw new Error(
				"Evidence deductions must use non-negative finite points."
			);
		}

		return total + deduction.points;
	}, 0);

	return Math.max(
		0,
		INITIAL_CALL_STANDING - totalDeductions
	);
}
