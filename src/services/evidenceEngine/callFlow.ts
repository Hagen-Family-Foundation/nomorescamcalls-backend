import {
	completeBlock3
} from "./block3";
import type {
	Block3Input,
	Block3EvidenceBox
} from "./block3";
import {
	completeBlock4
} from "./block4";
import type {
	Block4DeliveryRecord
} from "./block4";
import {
	receiveEvidenceBox
} from "../evidenceLibrary";
import type {
	EvidenceLibraryCallInformation,
	EvidenceLibraryReceipt,
	EvidenceLibrarySubscriber
} from "../evidenceLibrary";

export interface EvidenceEngineCallFlowInput {
	db: D1Database;
	block3Input: Block3Input;
	callInformation: EvidenceLibraryCallInformation;
	subscriber: EvidenceLibrarySubscriber;
	now?: () => string;
}

export interface EvidenceEngineCallFlowResult {
	block3EvidenceBox: Block3EvidenceBox;
	block4DeliveryRecord: Block4DeliveryRecord;
	evidenceLibraryReceipt:
		EvidenceLibraryReceipt | null;
}

export interface CompletedEvidenceEngineCallInput {
	db: D1Database;
	block3EvidenceBox: Block3EvidenceBox;
	callInformation: EvidenceLibraryCallInformation;
	subscriber: EvidenceLibrarySubscriber;
	now?: () => string;
}

export interface CompletedEvidenceEngineCallResult {
	block4DeliveryRecord: Block4DeliveryRecord;
	evidenceLibraryReceipt:
		EvidenceLibraryReceipt | null;
}

export async function deliverCompletedEvidenceEngineCall(
	input: CompletedEvidenceEngineCallInput
): Promise<CompletedEvidenceEngineCallResult> {
	let evidenceLibraryReceipt:
		EvidenceLibraryReceipt | null =
		null;

	const block4DeliveryRecord =
		await completeBlock4({
			block3EvidenceBox:
				input.block3EvidenceBox,
			evidenceLibrary: {
				async deliverEvidenceBox(
					evidenceBox
				): Promise<void> {
					evidenceLibraryReceipt =
						await receiveEvidenceBox(
							input.db,
							{
								evidenceBox,
								callInformation:
									input.callInformation,
								subscriber:
									input.subscriber
							},
							input.now
						);
				}
			},
			now: input.now
		});

	return {
		block4DeliveryRecord,
		evidenceLibraryReceipt
	};
}

export async function completeEvidenceEngineCall(
	input: EvidenceEngineCallFlowInput
): Promise<EvidenceEngineCallFlowResult> {
	const block3EvidenceBox =
		await completeBlock3(
			input.block3Input
		);
	const delivery =
		await deliverCompletedEvidenceEngineCall({
			db: input.db,
			block3EvidenceBox,
			callInformation: input.callInformation,
			subscriber: input.subscriber,
			now: input.now
		});

	return {
		block3EvidenceBox,
		...delivery
	};
}
