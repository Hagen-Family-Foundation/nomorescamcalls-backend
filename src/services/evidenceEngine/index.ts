import { determineAction } from "./action";
import { createCallEvidence } from "./call";
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
	const call = createCallEvidence();

	call.standing = currentStanding;
	call.deductions = input.deductions.map(({ source, reason, points }) => ({
		source,
		reason,
		points
	}));
	call.ipqsCompleted = input.ipqsCompleted ?? false;

	return {
		initialStanding: INITIAL_CALL_STANDING,
		currentStanding,
		deductions: [...input.deductions],
		nextStep: mapAction(determineAction(call))
	};
}

export * from "./types";
export * from "./call";

export * from "./evidenceCatalog";

export * from "./stage1";


export * from "./responseExtraction";
