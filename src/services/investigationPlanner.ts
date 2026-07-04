import type { BaselineCallEvidence } from "./evidence";

export interface InvestigationPlan {
	requiresAdditionalEvidence: boolean;
	performAiSpokenAnalysis: boolean;
	performVoiceTranscription: boolean;
	performIpqsLookup: boolean;
	performStirShakenValidation: boolean;
	reason: string;
}

export function planInvestigation(
	evidence: BaselineCallEvidence
): InvestigationPlan {
	if (evidence.evidenceClass === "allow_list") {
		return {
			requiresAdditionalEvidence: false,
			performAiSpokenAnalysis: false,
			performVoiceTranscription: false,
			performIpqsLookup: false,
			performStirShakenValidation: false,
			reason: "allow_list_caller_baseline_observation_only"
		};
	}

	if (evidence.evidenceClass === "confirmed_scam") {
		return {
			requiresAdditionalEvidence: false,
			performAiSpokenAnalysis: false,
			performVoiceTranscription: false,
			performIpqsLookup: false,
			performStirShakenValidation: false,
			reason: "confirmed_scam_diversion_does_not_require_reinvestigation"
		};
	}

	if (evidence.evidenceClass === "user_block_list") {
		return {
			requiresAdditionalEvidence: false,
			performAiSpokenAnalysis: false,
			performVoiceTranscription: false,
			performIpqsLookup: false,
			performStirShakenValidation: false,
			reason: "user_block_list_preference_does_not_require_reinvestigation"
		};
	}

	return {
		requiresAdditionalEvidence: false,
		performAiSpokenAnalysis: false,
		performVoiceTranscription: false,
		performIpqsLookup: false,
		performStirShakenValidation: false,
		reason: "unknown_caller_additional_investigation_not_enabled_yet"
	};
}
