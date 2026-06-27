import { addScreeningNumberToInventory } from "./screeningNumberInventory";
import {
	fetchTelnyxPhoneNumbers,
	type TelnyxPhoneNumbersClientConfig
} from "./telnyxPhoneNumbersClient";

export interface TelnyxInventorySyncInput {
	telnyxConfig: TelnyxPhoneNumbersClientConfig;
	voiceApplicationId?: string | null;
	connectionId?: string | null;
}

export interface TelnyxInventorySyncResult {
	mode: "simulated" | "live" | "live_failed";
	source: "telnyx_account";
	importedCount: number;
	numbers: string[];
	reason: string;
	status?: number;
}

export async function syncTelnyxInventory(
	db: D1Database,
	input: TelnyxInventorySyncInput
): Promise<TelnyxInventorySyncResult> {
	const fetched = await fetchTelnyxPhoneNumbers(input.telnyxConfig);

	const uniqueRecords = Array.from(
		new Map(
			fetched.numbers
				.filter((record) => record.phoneNumber.trim().length > 0)
				.map((record) => [record.phoneNumber.trim(), record])
		).values()
	);

	for (const record of uniqueRecords) {
		await addScreeningNumberToInventory(
			db,
			{
				phoneNumber: record.phoneNumber,
				provider: "telnyx",
				providerNumberId: record.providerNumberId,
				voiceApplicationId: record.voiceApplicationId ?? input.voiceApplicationId ?? null,
				connectionId: record.connectionId ?? input.connectionId ?? null
			}
		);
	}

	return {
		mode: fetched.mode,
		source: "telnyx_account",
		importedCount: uniqueRecords.length,
		numbers: uniqueRecords.map((record) => record.phoneNumber),
		reason: fetched.reason,
		status: fetched.status
	};
}
