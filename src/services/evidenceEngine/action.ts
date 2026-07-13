import type { CallEvidence } from "./call";

export type CallAction =
	| "release"
	| "ipqs"
	| "observe";

export function determineAction(
	call: CallEvidence
): CallAction {
	if (!call.ipqsCompleted &&
		call.standing >= 76 &&
		call.standing <= 85) {
		return "ipqs";
	}

	if (call.standing >= 76) {
		return "release";
	}

	return "observe";
}
