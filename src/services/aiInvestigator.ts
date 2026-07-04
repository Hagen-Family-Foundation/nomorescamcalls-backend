import type { BaselineCallEvidence } from "./evidence";
import type { InvestigationPlan } from "./investigationPlanner";
import type { EvidenceFinding } from "./evidenceFinding";
import { aggregateEvidenceFindings, type EvidenceSummary } from "./evidenceAggregator";
import { investigateIdentity, type IdentityInvestigationResult } from "./identityInvestigation";
import { investigateOrganization, type OrganizationInvestigationResult } from "./organizationInvestigation";
import { investigatePurpose, type PurposeInvestigationResult } from "./purposeInvestigation";
import { investigateUrgency, type UrgencyInvestigationResult } from "./urgencyInvestigation";
import {
	noSpokenCallerAnalysis,
	type SpokenCallerAnalysisResult
} from "./spokenCallerAnalysis";

export type AiInvestigationStatus =
	| "not_requested"
	| "completed";

export interface AiInvestigationRequest {
	baselineEvidence: BaselineCallEvidence;
	investigationPlan: InvestigationPlan;
	recordingUrl: string | null;
	transcript: string | null;
}

export interface AiInvestigationReport {
	status: AiInvestigationStatus;
	spokenCallerAnalysis: SpokenCallerAnalysisResult;
	identityInvestigation: IdentityInvestigationResult | null;
	organizationInvestigation: OrganizationInvestigationResult | null;
	purposeInvestigation: PurposeInvestigationResult | null;
	urgencyInvestigation: UrgencyInvestigationResult | null;
	evidenceFindings: EvidenceFinding[];
	evidenceSummary: EvidenceSummary;
	questionsAsked: string[];
	unansweredQuestions: string[];
	remainingUncertainty: number;
	reason: string;
}

export async function investigateCaller(
	request: AiInvestigationRequest
): Promise<AiInvestigationReport> {
	if (!request.investigationPlan.requiresAdditionalEvidence) {
		return {
			status: "not_requested",
			spokenCallerAnalysis: noSpokenCallerAnalysis(
				"ai_investigation_not_requested_by_plan"
			),
			identityInvestigation: null,
			organizationInvestigation: null,
			purposeInvestigation: null,
			evidenceFindings: [],
			evidenceSummary: aggregateEvidenceFindings([]),
			questionsAsked: [],
			unansweredQuestions: [],
			remainingUncertainty: 0,
			reason: request.investigationPlan.reason
		};
	}

	const identityInvestigation = investigateIdentity({
		transcript: request.transcript
	});

	const organizationInvestigation = investigateOrganization({
		transcript: request.transcript
	});

	const purposeInvestigation = investigatePurpose({
		transcript: request.transcript
	});

	const urgencyInvestigation = investigateUrgency({
		transcript: request.transcript
	});

	const evidenceFindings = [
		...identityInvestigation.evidenceFindings,
		...organizationInvestigation.evidenceFindings,
		...purposeInvestigation.evidenceFindings,
		...urgencyInvestigation.evidenceFindings
	];

	const evidenceSummary = aggregateEvidenceFindings(evidenceFindings);

	return {
		status: "completed",
		spokenCallerAnalysis: noSpokenCallerAnalysis(
			"ai_investigation_enabled_but_no_provider_connected"
		),
		identityInvestigation,
		organizationInvestigation,
		purposeInvestigation,
		urgencyInvestigation,
		evidenceFindings,
		evidenceSummary,
		questionsAsked: [],
		unansweredQuestions: identityInvestigation.status === "not_available"
			? ["Identity investigation requires a transcript."]
			: [],
		remainingUncertainty: evidenceSummary.remainingUncertainty,
		reason: "ai_investigator_completed_available_internal_investigations"
	};
}
