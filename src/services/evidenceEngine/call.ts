import {
	INITIAL_CALL_STANDING,
	type EvidenceSource
} from "./types";

export interface CallEvidence {
	standing: number;

	deductions: {
		source: EvidenceSource;
		reason: string;
		points: number;
	}[];

	ipqsRequested: boolean;
	ipqsCompleted: boolean;

	released: boolean;
	observing: boolean;
}

export function createCallEvidence(): CallEvidence {
	return {
		standing: INITIAL_CALL_STANDING,
		deductions: [],
		ipqsRequested: false,
		ipqsCompleted: false,
		released: false,
		observing: false
	};
}
