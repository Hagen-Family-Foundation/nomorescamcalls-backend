import type { EvidenceFinding } from "./evidenceFinding";

export interface IdentityInvestigationInput {
	transcript: string | null;
}

export interface IdentityInvestigationResult {
	status: "not_available" | "completed";
	claimedName: string | null;
	claimedOrganization: string | null;
	callPurpose: string | null;
	evidenceFindings: EvidenceFinding[];
	remainingUncertainty: number;
	reason: string;
}

export function investigateIdentity(
	input: IdentityInvestigationInput
): IdentityInvestigationResult {
	if (!input.transcript || input.transcript.trim().length === 0) {
		return {
			status: "not_available",
			claimedName: null,
			claimedOrganization: null,
			callPurpose: null,
			evidenceFindings: [],
			remainingUncertainty: 1,
			reason: "identity_investigation_requires_transcript"
		};
	}

	return {
		status: "completed",
		claimedName: null,
		claimedOrganization: null,
		callPurpose: null,
		evidenceFindings: [
			{
				type: "identity_transcript_available",
				description:
					"Caller provided spoken material that can be reviewed for identity evidence.",
				direction: "neutral",
				confidence: 1
			}
		],
		remainingUncertainty: 0.8,
		reason: "identity_investigation_placeholder_completed"
	};
}
