import {
	INITIAL_CALL_STANDING
} from "./types";
import type {
	Block1EvidenceBox
} from "./block1";

export interface Block2ScreeningInformation {
	callingNumberInformation: unknown;
	stirShakenInformation: unknown;
	cnamInformation: unknown;
	carrierLineLookupInformation: unknown;
}

export interface Block2Input {
	block1EvidenceBox: Block1EvidenceBox;
	screeningInformation: Block2ScreeningInformation;
}

export interface Block2EvidenceBox {
	block1EvidenceBox: Block1EvidenceBox;
	startingStanding: number;
	callingNumberInformation: unknown;
	stirShakenInformation: unknown;
	cnamInformation: unknown;
	carrierLineLookupInformation: unknown;
}

export function completeBlock2(
	input: Block2Input
): Block2EvidenceBox {
	return {
		block1EvidenceBox: input.block1EvidenceBox,
		startingStanding: INITIAL_CALL_STANDING,
		callingNumberInformation:
			input.screeningInformation.callingNumberInformation,
		stirShakenInformation:
			input.screeningInformation.stirShakenInformation,
		cnamInformation:
			input.screeningInformation.cnamInformation,
		carrierLineLookupInformation:
			input.screeningInformation.carrierLineLookupInformation
	};
}
