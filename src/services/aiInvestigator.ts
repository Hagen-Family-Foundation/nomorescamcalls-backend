import type { BaselineCallEvidence } from "./evidence";
import type { InvestigationPlan } from "./investigationPlanner";
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

export type AiEvidenceDirection =
	| "supports_legitimacy"
	| "supports_suspicion"
	| "neutral";

export interface AiEvidenceFinding {
	type: string;
	description: string;
	direction: AiEvidenceDirection;
	confidence: number;
}

export interface AiInvestigationReport {
	status: AiInvestigationStatus;
	spokenCallerAnalysis: SpokenCallerAnalysisResult;
	evidenceFindings: AiEvidenceFinding[];
	questionsAsked: string[];
	unansweredQuestions: string[];
	evidenceSummary: string;
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
			evidenceFindings: [],
			questionsAsked: [],
			unansweredQuestions: [],
			evidenceSummary: "No additional AI investigation was requested.",
			remainingUncertainty: 0,
			reason: request.investigationPlan.reason
		};
	}

	return {
		status: "completed",
		spokenCallerAnalysis: noSpokenCallerAnalysis(
			"ai_investigation_enabled_but_no_provider_connected"
		),
		evidenceFindings: [],
		questionsAsked: [],
		unansweredQuestions: [
			"AI investigation provider has not been connected."
		],
		evidenceSummary:
			"AI investigation was requested, but no external model provider is connected yet.",
		remainingUncertainty: 1,
		reason: "ai_investigator_provider_not_connected"
	};
}
