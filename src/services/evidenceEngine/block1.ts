export interface Block1Input {
	callInformation: unknown;
	callRecord: unknown;
	billingTimer: unknown;
}

export interface Block1EvidenceBox {
	callInformation: unknown;
	callRecord: unknown;
	billingTimer: unknown;
}

export function completeBlock1(
	input: Block1Input
): Block1EvidenceBox {
	return {
		callInformation: input.callInformation,
		callRecord: input.callRecord,
		billingTimer: input.billingTimer
	};
}
