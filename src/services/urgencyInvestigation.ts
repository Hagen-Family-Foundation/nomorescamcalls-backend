import type { EvidenceFinding } from "./evidenceFinding";

export interface UrgencyInvestigationRequest {
	transcript: string | null;
}

export interface UrgencyInvestigationResult {
	status: "completed" | "not_available";
	evidenceFindings: EvidenceFinding[];
	remainingUncertainty: number;
	reason: string;
}

export function investigateUrgency(
	request: UrgencyInvestigationRequest
): UrgencyInvestigationResult {
	if (!request.transcript) {
		return {
			status: "not_available",
			evidenceFindings: [],
			remainingUncertainty: 1,
			reason: "urgency_requires_transcript"
		};
	}

	return {
		status: "completed",
		evidenceFindings: [
			{
				type: "urgency_transcript_available",
				description:
					"Caller provided spoken material that can be reviewed for urgency and pressure tactics.",
				direction: "neutral",
				confidence: 1
			}
		],
		remainingUncertainty: 0.8,
		reason: "urgency_investigation_placeholder_completed"
	};
}
