import type { CallEvidence } from "./call";
import {
	applyDeduction,
	type DeductionInput
} from "./deductions";
import {
	determineAction,
	type CallAction
} from "./action";

export interface EvidenceResult {
	call: CallEvidence;
	action: CallAction;
}

export function recordEvidence(
	call: CallEvidence,
	evidence: DeductionInput
): EvidenceResult {
	const updatedCall = applyDeduction(call, evidence);

	return {
		call: updatedCall,
		action: determineAction(updatedCall)
	};
}
