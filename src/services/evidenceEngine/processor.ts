import type { CallEvidence } from "./call";
import { applyDeduction } from "./deductions";
import { determineAction } from "./action";

export interface DeductionInput {
	reason: string;
	points: number;
}

export function processCall(
	call: CallEvidence,
	deductions: DeductionInput[]
) {
	let current = call;

	for (const deduction of deductions) {
		current = applyDeduction(current, deduction);
	}

	return {
		call: current,
		action: determineAction(current)
	};
}
