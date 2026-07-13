import type { CallEvidence } from "./call";
import type { EvidenceSource } from "./types";

export interface DeductionInput {
	source: EvidenceSource;
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
				source: deduction.source,
				reason: deduction.reason,
				points: deduction.points
			}
		]
	};
}
