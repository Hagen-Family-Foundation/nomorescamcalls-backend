export interface EvidenceLibraryInput {
	evidenceBox: unknown;
}

export interface EvidenceLibraryReceipt {
	evidenceBox: unknown;
	libraryTimestamp: string;
	aisle: "successful_calls" | "diverted_calls";
}

export function receiveEvidenceBox(
	input: EvidenceLibraryInput
): EvidenceLibraryReceipt {
	throw new Error("Evidence Library not yet implemented.");
}