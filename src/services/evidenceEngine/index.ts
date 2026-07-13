import { determineNextStep } from "./determination";
import { calculateCurrentStanding } from "./scoring";
import {
	INITIAL_CALL_STANDING,
	type EvidenceDeduction,
	type EvidenceEngineState
} from "./types";

export interface EvaluateCurrentCallInput {
	deductions: EvidenceDeduction[];
	ipqsCompleted?: boolean;
}

export function evaluateCurrentCall(
	input: EvaluateCurrentCallInput
): EvidenceEngineState {
	const currentStanding = calculateCurrentStanding(input.deductions);

	return {
		initialStanding: INITIAL_CALL_STANDING,
		currentStanding,
		deductions: [...input.deductions],
		nextStep: determineNextStep(currentStanding, {
			ipqsCompleted: input.ipqsCompleted ?? false
		})
	};
}

export * from "./types";
