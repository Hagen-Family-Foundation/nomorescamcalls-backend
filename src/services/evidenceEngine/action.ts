import {
	IPQS_RANGE_MAX,
	IPQS_RANGE_MIN
} from "./types";

export type CallAction =
	| "release"
	| "ipqs"
	| "observe";

export interface DetermineActionInput {
	standing: number;
	ipqsCompleted: boolean;
}

export function determineAction(
	input: DetermineActionInput
): CallAction {
	if (!Number.isFinite(input.standing)) {
		throw new Error("Call standing must be a finite number.");
	}

	if (
		!input.ipqsCompleted &&
		input.standing >= IPQS_RANGE_MIN &&
		input.standing <= IPQS_RANGE_MAX
	) {
		return "ipqs";
	}

	if (input.standing >= IPQS_RANGE_MIN) {
		return "release";
	}

	return "observe";
}
