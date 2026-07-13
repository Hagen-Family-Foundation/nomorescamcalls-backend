export const EVIDENCE_CATEGORY = {
	STAGE_1: "stage_1",
	CALLER_RESPONSE: "caller_response",
	RESPONSE_TIMING: "response_timing",
	EXTERNAL: "external"
} as const;

export type EvidenceCategory =
	(typeof EVIDENCE_CATEGORY)[keyof typeof EVIDENCE_CATEGORY];
