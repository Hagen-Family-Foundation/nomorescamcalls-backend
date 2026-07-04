import type { EvidenceFinding } from "./evidenceFinding";

export interface OrganizationInvestigationInput {
	transcript: string | null;
}

export interface OrganizationInvestigationResult {
	status: "not_available" | "completed";
	claimedOrganization: string | null;
	organizationVerified: boolean;
	evidenceFindings: EvidenceFinding[];
	remainingUncertainty: number;
	reason: string;
}

export function investigateOrganization(
	input: OrganizationInvestigationInput
): OrganizationInvestigationResult {
	if (!input.transcript || input.transcript.trim().length === 0) {
		return {
			status: "not_available",
			claimedOrganization: null,
			organizationVerified: false,
			evidenceFindings: [],
			remainingUncertainty: 1,
			reason: "organization_investigation_requires_transcript"
		};
	}

	return {
		status: "completed",
		claimedOrganization: null,
		organizationVerified: false,
		evidenceFindings: [
			{
				type: "organization_transcript_available",
				description:
					"Caller provided spoken material that can be reviewed for organization evidence.",
				direction: "neutral",
				confidence: 1
			}
		],
		remainingUncertainty: 0.8,
		reason: "organization_investigation_placeholder_completed"
	};
}
