export const INITIAL_CALL_STANDING = 100;
export const RELEASE_THRESHOLD = 76;
export const IPQS_RANGE_MIN = 76;
export const IPQS_RANGE_MAX = 85;

export function isIpqsEligibleStanding(
	standing: number
): boolean {
	return standing >= IPQS_RANGE_MIN
		&& standing <= IPQS_RANGE_MAX;
}

export type EvidenceSource =
	| "stage_1"
	| "caller_response"
	| "response_comparison"
	| "ipqs";

export interface EvidenceDeduction {
	source: EvidenceSource;
	reason: string;
	points: number;
}

export type EvidenceEngineNextStep =
	| "release"
	| "request_ipqs"
	| "continue_observation";

export interface EvidenceEngineState {
	initialStanding: number;
	currentStanding: number;
	deductions: EvidenceDeduction[];
	nextStep: EvidenceEngineNextStep;
}
