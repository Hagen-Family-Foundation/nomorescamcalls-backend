export const EVIDENCE = {
	STAGE_1_OBJECTIVE: "stage_1_objective",

	FIRST_RESPONSE_NAME_MISSING: "first_response_name_missing",
	FIRST_RESPONSE_REASON_MISSING: "first_response_reason_missing",
	FIRST_RESPONSE_UNUSABLE: "first_response_unusable",
	FIRST_RESPONSE_SILENCE: "first_response_silence",

	SECOND_RESPONSE_NAME_MISSING: "second_response_name_missing",
	SECOND_RESPONSE_REASON_MISSING: "second_response_reason_missing",
	SECOND_RESPONSE_UNUSABLE: "second_response_unusable",
	SECOND_RESPONSE_SILENCE: "second_response_silence",

	IPQS_FINDING: "ipqs_finding"
} as const;

export type EvidenceType =
	(typeof EVIDENCE)[keyof typeof EVIDENCE];
