import type {
	Block3EvidenceBox
} from "./block3";

export interface Block4EvidenceLibrary {
	deliverEvidenceBox(
		evidenceBox: Block3EvidenceBox
	): Promise<void>;
}

export interface Block4Input {
	block3EvidenceBox: Block3EvidenceBox;
	evidenceLibrary: Block4EvidenceLibrary;
	now?: () => string;
}

export interface Block4DeliveryRecord {
	deliveryAttempted: boolean;
	deliveryTimestamp: string;
	deliveryCompleted: boolean;
	deliveryError: string | null;
}

function errorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
}

export async function completeBlock4(
	input: Block4Input
): Promise<Block4DeliveryRecord> {
	let deliveryCompleted = false;
	let deliveryError: string | null = null;

	try {
		await input.evidenceLibrary.deliverEvidenceBox(
			input.block3EvidenceBox
		);

		deliveryCompleted = true;
	} catch (error) {
		deliveryError = errorMessage(error);
	}

	return {
		deliveryAttempted: true,
		deliveryTimestamp:
			input.now?.() ??
			new Date().toISOString(),
		deliveryCompleted,
		deliveryError
	};
}
