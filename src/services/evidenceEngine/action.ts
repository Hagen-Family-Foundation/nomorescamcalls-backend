import type { CallEvidence } from "./call";
import {
	IPQS_RANGE_MAX,
	IPQS_RANGE_MIN
} from "./types";

export type CallAction =
	| "release"
	| "ipqs"
	| "observe";

export function determineAction(
	call: CallEvidence
): CallAction {
	if (!Number.isFinite(call.standing)) {
		throw new Error("Call standing must be a finite number.");
	}

	if (
		!call.ipqsCompleted &&
		call.standing >= IPQS_RANGE_MIN &&
		call.standing <= IPQS_RANGE_MAX
	) {
		return "ipqs";
	}

	if (call.standing >= IPQS_RANGE_MIN) {
		return "release";
	}

	return "observe";
}
