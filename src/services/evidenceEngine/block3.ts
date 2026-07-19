import type {
	Block2Deduction,
	Block2EvidenceBox
} from "./block2";
import {
	evaluateCallerResponse
} from "./responseExtraction";
import type {
	CallerResponseEvaluator,
	CallerResponseResult
} from "./responseExtraction";
import {
	IPQS_RANGE_MAX,
	IPQS_RANGE_MIN
} from "./types";

const FAILED_NAME_DEDUCTION = 15;
const FAILED_REASON_DEDUCTION = 15;
const IPQS_ADVERSE_FINDING_DEDUCTION = 10;

export interface Block3PromptEvidence {
	audioRecordingReference: string | null;
	transcript: string;
	language: string | null;
}

export interface Block3PromptResult
	extends Block3PromptEvidence {
	evaluation: CallerResponseResult;
}

export interface Block3Deduction {
	finding: string;
	reason: string;
	points: number;
}

export interface IpqsLookupResult {
	adverseFinding: boolean;
	finding: string | null;
	reason: string | null;
}

export interface IpqsLookup {
	lookup(
		block2EvidenceBox: Block2EvidenceBox
	): Promise<IpqsLookupResult>;
}

export interface Block3Input {
	block2EvidenceBox: Block2EvidenceBox;
	prompt1: Block3PromptEvidence;
	prompt2: Block3PromptEvidence;
	evaluator: CallerResponseEvaluator;
	ipqsLookup?: IpqsLookup;
}

export interface Block3EvidenceBox {
	block2EvidenceBox: Block2EvidenceBox;
	prompt1: Block3PromptResult;
	prompt2: Block3PromptResult;
	block2Deductions: Block2Deduction[];
	block3Deductions: Block3Deduction[];
	ipqsDeductions: Block3Deduction[];
	allDeductions: Array<Block2Deduction | Block3Deduction>;
	standingBeforeIpqs: number;
	ipqsPerformed: boolean;
	finalStanding: number;
}

function totalPoints(
	deductions: Array<{ points: number }>
): number {
	return deductions.reduce(
		(total, deduction) =>
			total + deduction.points,
		0
	);
}

function calculateStanding(
	startingStanding: number,
	deductions: Array<{ points: number }>
): number {
	return Math.max(
		0,
		startingStanding - totalPoints(deductions)
	);
}

export async function completeBlock3(
	input: Block3Input
): Promise<Block3EvidenceBox> {
	const prompt1Evaluation =
		await evaluateCallerResponse(
			input.prompt1.transcript,
			input.prompt1.language,
			input.evaluator
		);

	const prompt2Evaluation =
		await evaluateCallerResponse(
			input.prompt2.transcript,
			input.prompt2.language,
			input.evaluator
		);

	const prompt1: Block3PromptResult = {
		...input.prompt1,
		evaluation: prompt1Evaluation
	};

	const prompt2: Block3PromptResult = {
		...input.prompt2,
		evaluation: prompt2Evaluation
	};

	const block3Deductions: Block3Deduction[] = [];

	if (
		!prompt1Evaluation.nameAccepted &&
		!prompt2Evaluation.nameAccepted
	) {
		block3Deductions.push({
			finding:
				"Both name attempts failed",
			reason:
				"The caller did not provide an acceptable name in either response.",
			points: FAILED_NAME_DEDUCTION
		});
	}

	if (
		!prompt1Evaluation.reasonAccepted &&
		!prompt2Evaluation.reasonAccepted
	) {
		block3Deductions.push({
			finding:
				"Both reason attempts failed",
			reason:
				"The caller did not provide an acceptable reason for calling in either response.",
			points: FAILED_REASON_DEDUCTION
		});
	}

	const block2Deductions =
		input.block2EvidenceBox.deductions;

	const standingBeforeIpqs =
		calculateStanding(
			input.block2EvidenceBox.startingStanding,
			[
				...block2Deductions,
				...block3Deductions
			]
		);

	const ipqsDeductions: Block3Deduction[] = [];
	let ipqsPerformed = false;

	if (
		standingBeforeIpqs >= IPQS_RANGE_MIN &&
		standingBeforeIpqs <= IPQS_RANGE_MAX
	) {
		if (!input.ipqsLookup) {
			throw new Error(
				"IPQS lookup is required when standing is between 76 and 85."
			);
		}

		ipqsPerformed = true;

		const ipqsResult =
			await input.ipqsLookup.lookup(
				input.block2EvidenceBox
			);

		if (ipqsResult.adverseFinding) {
			ipqsDeductions.push({
				finding:
					ipqsResult.finding ??
					"IPQS adverse finding",
				reason:
					ipqsResult.reason ??
					"IPQS reported an adverse finding for the calling number.",
				points:
					IPQS_ADVERSE_FINDING_DEDUCTION
			});
		}
	}

	const allDeductions = [
		...block2Deductions,
		...block3Deductions,
		...ipqsDeductions
	];

	const finalStanding =
		calculateStanding(
			input.block2EvidenceBox.startingStanding,
			allDeductions
		);

	return {
		block2EvidenceBox:
			input.block2EvidenceBox,
		prompt1,
		prompt2,
		block2Deductions,
		block3Deductions,
		ipqsDeductions,
		allDeductions,
		standingBeforeIpqs,
		ipqsPerformed,
		finalStanding
	};
}
