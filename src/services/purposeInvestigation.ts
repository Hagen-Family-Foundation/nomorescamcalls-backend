import type { EvidenceFinding } from "./evidenceFinding";

export interface PurposeInvestigationInput {
	transcript: string | null;
}

export interface PurposeInvestigationResult {
	status: "not_available" | "completed";
	purpose: string | null;
	evidenceFindings: EvidenceFinding[];
	remainingUncertainty: number;
	reason: string;
}

export function investigatePurpose(
	input: PurposeInvestigationInput
): PurposeInvestigationResult {
	if (!input.transcript || input.transcript.trim().length === 0) {
		return {
			status: "not_available",
			purpose: null,
			evidenceFindings: [],
			remainingUncertainty: 1,
			reason: "purpose_investigation_requires_transcript"
		};
	}

	return {
		status: "completed",
		purpose: null,
		evidenceFindings: [
			{
				type: "purpose_transcript_available",
				description:
					"Caller provided spoken material that can be reviewed for call purpose evidence.",
				direction: "neutral",
				confidence: 1
			}
		],
		remainingUncertainty: 0.8,
		reason: "purpose_investigation_placeholder_completed"
	};
}
