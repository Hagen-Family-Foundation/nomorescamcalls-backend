import type { AiInvestigationReport } from "./aiInvestigator";
import type { BaselineCallEvidence } from "./evidence";
import type { InvestigationPlan } from "./investigationPlanner";

export interface CallEvidencePackage {
	baselineEvidence: BaselineCallEvidence;
	investigationPlan: InvestigationPlan;
	aiInvestigationReport: AiInvestigationReport | null;
}

export function buildCallEvidencePackage(
	baselineEvidence: BaselineCallEvidence,
	investigationPlan: InvestigationPlan,
	aiInvestigationReport: AiInvestigationReport | null = null
): CallEvidencePackage {
	return {
		baselineEvidence,
		investigationPlan,
		aiInvestigationReport
	};
}
