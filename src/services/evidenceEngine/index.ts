import { determineAction } from "./action";
import { calculateCurrentStanding } from "./scoring";
import {
	INITIAL_CALL_STANDING,
	type EvidenceDeduction,
	type EvidenceEngineState,
	type EvidenceEngineNextStep
} from "./types";

export interface EvaluateCurrentCallInput {
	deductions: EvidenceDeduction[];
	ipqsCompleted?: boolean;
}

function mapAction(
	action: "release" | "ipqs" | "observe"
): EvidenceEngineNextStep {
	if (action === "ipqs") {
		return "request_ipqs";
	}

	if (action === "observe") {
		return "continue_observation";
	}

	return "release";
}

export function evaluateCurrentCall(
	input: EvaluateCurrentCallInput
): EvidenceEngineState {
	const currentStanding = calculateCurrentStanding(input.deductions);
	return {
		initialStanding: INITIAL_CALL_STANDING,
		currentStanding,
		deductions: [...input.deductions],
		nextStep: mapAction(
			determineAction({
				standing: currentStanding,
				ipqsCompleted: input.ipqsCompleted ?? false
			})
		)
	};
}

export * from "./types";


export * from "./stage1";


export * from "./responseExtraction";
