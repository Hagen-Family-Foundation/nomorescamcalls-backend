export type EvidenceDirection =
	| "supports_legitimacy"
	| "supports_suspicion"
	| "neutral";

export interface EvidenceFinding {
	type: string;
	description: string;
	direction: EvidenceDirection;
	confidence: number;
}
