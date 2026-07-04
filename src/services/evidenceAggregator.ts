import type { EvidenceFinding } from "./evidenceFinding";

export interface EvidenceSummary {
	supportsLegitimacy: EvidenceFinding[];
	supportsSuspicion: EvidenceFinding[];
	neutral: EvidenceFinding[];
	conflictingEvidence: boolean;
	averageConfidence: number;
	remainingUncertainty: number;
	summary: string;
}

export function aggregateEvidenceFindings(
	findings: EvidenceFinding[]
): EvidenceSummary {
	const supportsLegitimacy = findings.filter(
		(finding) => finding.direction === "supports_legitimacy"
	);

	const supportsSuspicion = findings.filter(
		(finding) => finding.direction === "supports_suspicion"
	);

	const neutral = findings.filter(
		(finding) => finding.direction === "neutral"
	);

	const conflictingEvidence =
		supportsLegitimacy.length > 0 && supportsSuspicion.length > 0;

	const averageConfidence = findings.length === 0
		? 0
		: findings.reduce((total, finding) => total + finding.confidence, 0) /
			findings.length;

	const remainingUncertainty = findings.length === 0
		? 1
		: Math.max(0, 1 - averageConfidence);

	return {
		supportsLegitimacy,
		supportsSuspicion,
		neutral,
		conflictingEvidence,
		averageConfidence,
		remainingUncertainty,
		summary: summarizeEvidence(
			supportsLegitimacy.length,
			supportsSuspicion.length,
			neutral.length,
			conflictingEvidence
		)
	};
}

function summarizeEvidence(
	legitimacyCount: number,
	suspicionCount: number,
	neutralCount: number,
	conflictingEvidence: boolean
): string {
	if (legitimacyCount === 0 && suspicionCount === 0 && neutralCount === 0) {
		return "No evidence findings were available.";
	}

	if (conflictingEvidence) {
		return "Evidence contains both legitimacy-supporting and suspicion-supporting findings.";
	}

	if (suspicionCount > 0) {
		return "Evidence contains suspicion-supporting findings.";
	}

	if (legitimacyCount > 0) {
		return "Evidence contains legitimacy-supporting findings.";
	}

	return "Evidence contains neutral findings only.";
}
