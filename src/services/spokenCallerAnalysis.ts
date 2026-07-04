export type SpokenCallerAnalysisStatus =
	| "not_requested"
	| "pending"
	| "completed"
	| "failed";

export interface SpokenScamIndicator {
	type: string;
	description: string;
	confidence: number;
}

export interface SpokenCallerAnalysisResult {
	status: SpokenCallerAnalysisStatus;
	transcript: string | null;
	summary: string | null;
	scamIndicators: SpokenScamIndicator[];
	riskContribution: number;
	confidence: number;
	reason: string;
}

export function noSpokenCallerAnalysis(
	reason = "spoken_caller_analysis_not_requested"
): SpokenCallerAnalysisResult {
	return {
		status: "not_requested",
		transcript: null,
		summary: null,
		scamIndicators: [],
		riskContribution: 0,
		confidence: 0,
		reason
	};
}
