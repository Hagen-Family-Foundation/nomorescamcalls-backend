import type { EvidenceFinding } from "./evidenceFinding";

export interface ThreatInvestigationRequest {
	transcript: string | null;
}

export interface ThreatInvestigationResult {
	status: "completed" | "not_available";
	evidenceFindings: EvidenceFinding[];
	remainingUncertainty: number;
	reason: string;
}

export function investigateThreats(
	request: ThreatInvestigationRequest
): ThreatInvestigationResult {
	if (!request.transcript || request.transcript.trim().length === 0) {
		return {
			status: "not_available",
			evidenceFindings: [],
			remainingUncertainty: 1,
			reason: "threat_investigation_requires_transcript"
		};
	}

	return {
		status: "completed",
		evidenceFindings: [
			{
				type: "threat_transcript_available",
				description:
					"Caller provided spoken material that can be reviewed for threats, intimidation, or coercion.",
				direction: "neutral",
				confidence: 1
			}
		],
		remainingUncertainty: 0.8,
		reason: "threat_investigation_placeholder_completed"
	};
}
