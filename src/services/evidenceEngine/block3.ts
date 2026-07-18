import type {
	Block2EvidenceBox
} from "./block2";
import {
	evaluateCallerResponse,
	type CallerResponseEvaluator,
	type CallerResponseResult
} from "./responseExtraction";
import type {
	EvidenceDeduction
} from "./types";

const MISSING_NAME_DEDUCTION = 15;
const MISSING_REASON_DEDUCTION = 15;

export interface Block3PromptInput {
	audioRecordingReference: string | null;
	transcript: string;
	language: string | null;
}

export interface Block3Input {
	block2EvidenceBox: Block2EvidenceBox;
	prompt1: Block3PromptInput;
	prompt2: Block3PromptInput;
	evaluator: CallerResponseEvaluator;
}

export interface Block3PromptEvidence
	extends CallerResponseResult {
	audioRecordingReference: string | null;
	deductions: EvidenceDeduction[];
}

export interface Block3EvidenceBox {
	block2EvidenceBox: Block2EvidenceBox;
	prompt1: Block3PromptEvidence;
	prompt2: Block3PromptEvidence;
	deductions: EvidenceDeduction[];
	totalBlock3Deductions: number;
}

function originateDeductions(
	evaluation: CallerResponseResult,
	promptNumber: 1 | 2
): EvidenceDeduction[] {
	const deductions: EvidenceDeduction[] = [];

	if (!evaluation.nameAccepted) {
		deductions.push({
			source: "caller_response",
			reason: `prompt_${promptNumber}_missing_or_unusable_name`,
			points: MISSING_NAME_DEDUCTION
		});
	}

	if (!evaluation.reasonAccepted) {
		deductions.push({
			source: "caller_response",
			reason: `prompt_${promptNumber}_missing_or_unusable_reason`,
			points: MISSING_REASON_DEDUCTION
		});
	}

	return deductions;
}

async function completePrompt(
	input: Block3PromptInput,
	promptNumber: 1 | 2,
	evaluator: CallerResponseEvaluator
): Promise<Block3PromptEvidence> {
	const evaluation = await evaluateCallerResponse(
		input.transcript,
		input.language,
		evaluator
	);

	return {
		audioRecordingReference:
			input.audioRecordingReference,
		...evaluation,
		deductions: originateDeductions(
			evaluation,
			promptNumber
		)
	};
}

export async function completeBlock3(
	input: Block3Input
): Promise<Block3EvidenceBox> {
	const prompt1 = await completePrompt(
		input.prompt1,
		1,
		input.evaluator
	);

	const prompt2 = await completePrompt(
		input.prompt2,
		2,
		input.evaluator
	);

	const deductions = [
		...prompt1.deductions,
		...prompt2.deductions
	];

	return {
		block2EvidenceBox: input.block2EvidenceBox,
		prompt1,
		prompt2,
		deductions,
		totalBlock3Deductions: deductions.reduce(
			(total, deduction) =>
				total + deduction.points,
			0
		)
	};
}
