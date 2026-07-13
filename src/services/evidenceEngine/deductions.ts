import type { CallEvidence } from "./call";

export interface DeductionInput {
	reason: string;
	points: number;
}

export function applyDeduction(
	call: CallEvidence,
	deduction: DeductionInput
): CallEvidence {
	if (!Number.isFinite(deduction.points) || deduction.points < 0) {
		throw new Error("Deduction points must be zero or greater.");
	}

	return {
		...call,
		standing: Math.max(0, call.standing - deduction.points),
		deductions: [
			...call.deductions,
			{
				reason: deduction.reason,
				points: deduction.points
			}
		]
	};
}
