import type { CallEvidence } from "./call";
import {
	applyDeduction,
	type DeductionInput
} from "./deductions";
import { determineAction } from "./action";

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
