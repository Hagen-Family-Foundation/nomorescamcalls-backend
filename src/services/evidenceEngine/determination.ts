import {
	IPQS_RANGE_MAX,
	IPQS_RANGE_MIN,
	type EvidenceEngineNextStep
} from "./types";

export interface DeterminationContext {
	ipqsCompleted: boolean;
}

export function determineNextStep(
	currentStanding: number,
	context: DeterminationContext = { ipqsCompleted: false }
): EvidenceEngineNextStep {
	if (!Number.isFinite(currentStanding)) {
		throw new Error("Current standing must be a finite number.");
	}

	if (
		!context.ipqsCompleted &&
		currentStanding >= IPQS_RANGE_MIN &&
		currentStanding <= IPQS_RANGE_MAX
	) {
		return "request_ipqs";
	}

	if (currentStanding >= IPQS_RANGE_MIN) {
		return "release";
	}

	return "continue_observation";
}
