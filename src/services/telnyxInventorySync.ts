import { addScreeningNumberToInventory } from "./screeningNumberInventory";

export interface TelnyxInventorySyncInput {
	numbers: string[];
	source?: string;
}

export interface TelnyxInventorySyncResult {
	mode: "simulated";
	source: string;
	importedCount: number;
	numbers: string[];
}

export async function syncTelnyxInventory(
	db: D1Database,
	input: TelnyxInventorySyncInput
): Promise<TelnyxInventorySyncResult> {
	const uniqueNumbers = [...new Set(
		input.numbers
			.map((number) => number.trim())
			.filter((number) => number.length > 0)
	)];

	for (const number of uniqueNumbers) {
		await addScreeningNumberToInventory(db, number);
	}

	return {
		mode: "simulated",
		source: input.source ?? "manual_sync_request",
		importedCount: uniqueNumbers.length,
		numbers: uniqueNumbers
	};
}
