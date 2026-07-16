import {
	INITIAL_CALL_STANDING,
	IPQS_RANGE_MAX,
	IPQS_RANGE_MIN,
	type EvidenceDeduction,
	type EvidenceEngineState,
	type EvidenceEngineNextStep
} from "./types";

export interface Block5Input {
	deductions: EvidenceDeduction[];
	ipqsCompleted?: boolean;
}

function calculateStanding(
	deductions: EvidenceDeduction[]
): number {
	const totalDeductions = deductions.reduce((total, deduction) => {
		if (!Number.isFinite(deduction.points) || deduction.points < 0) {
			throw new Error(
				"Evidence deductions must use non-negative finite points."
			);
		}

		return total + deduction.points;
	}, 0);

	return Math.max(0, INITIAL_CALL_STANDING - totalDeductions);
}

function determineNextStep(
	standing: number,
	ipqsCompleted: boolean
): EvidenceEngineNextStep {
	if (
		!ipqsCompleted &&
		standing >= IPQS_RANGE_MIN &&
		standing <= IPQS_RANGE_MAX
	) {
		return "request_ipqs";
	}

	if (standing >= IPQS_RANGE_MIN) {
		return "release";
	}

	return "continue_observation";
}

export function runBlock5(
	input: Block5Input
): EvidenceEngineState {
	const currentStanding = calculateStanding(input.deductions);

	return {
		initialStanding: INITIAL_CALL_STANDING,
		currentStanding,
		deductions: [...input.deductions],
		nextStep: determineNextStep(
			currentStanding,
			input.ipqsCompleted ?? false
		)
	};
}
