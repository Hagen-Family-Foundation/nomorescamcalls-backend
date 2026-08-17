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
	isIpqsEligibleStanding,
	RELEASE_THRESHOLD
} from "./types";

const PROMPT1_NAME_DEDUCTION = 8;
const PROMPT1_REASON_DEDUCTION = 12;
const PROMPT2_NAME_DEDUCTION = 10;
const PROMPT2_REASON_DEDUCTION = 15;
const COMPLETE_RESPONSE_DEFICIENCY_DEDUCTION = 5;
const IPQS_FIELD_DEDUCTION = 5;

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
	source: "OpenAI" | "IPQS";
	finding: string;
	reason: string;
	points: number;
}

export interface Block3RecoveredDeduction {
	source: "OpenAI";
	finding: string;
	points: number;
}

export interface IpqsLookupResult {
	response: unknown;
	valid: boolean | null;
	active: boolean | null;
	recent_abuse: boolean | null;
	spammer: boolean | null;
}

export interface IpqsLookup {
	lookup(
		block2EvidenceBox: Block2EvidenceBox
	): Promise<IpqsLookupResult>;
}

export interface Block3CallController {
	startRecording(): Promise<void>;
	connectSubscriber(): Promise<void>;
	playUnavailableAndDisconnect(): Promise<void>;
	playTechnicalDifficultiesAndDisconnect(): Promise<void>;
	stopRecording(): Promise<void>;
}

export interface Block3Input {
	block2EvidenceBox: Block2EvidenceBox;
	prompt1: Block3PromptEvidence;
	prompt2?: Block3PromptEvidence;
	evaluator: CallerResponseEvaluator;
	ipqsLookup?: IpqsLookup;
	callController: Block3CallController;
}

export type Block3CallResult =
	| "connected"
	| "diverted";

export interface Block3EvidenceBox {
	block2EvidenceBox: Block2EvidenceBox;
	prompt1: Block3PromptResult;
	prompt2: Block3PromptResult | null;
	block2Deductions: Block2Deduction[];
	initialCallerResponseDeductions:
		Block3Deduction[];
	recoveredCallerResponseDeductions:
		Block3RecoveredDeduction[];
	block3Deductions: Block3Deduction[];
	ipqsPerformed: boolean;
	ipqsResult: IpqsLookupResult | null;
	ipqsDeductions: Block3Deduction[];
	allDeductions:
		Array<Block2Deduction | Block3Deduction>;
	standingAfterFirstResponse: number;
	finalStanding: number;
	callResult: Block3CallResult;
	recordingCompleted: boolean;
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
		startingStanding -
			totalPoints(deductions)
	);
}

function createPrompt1Deductions(
	evaluation: CallerResponseResult
): Block3Deduction[] {
	const deductions: Block3Deduction[] = [];

	if (!evaluation.nameAccepted) {
		deductions.push({
			source: "OpenAI",
			finding: "name",
			reason:
				"The caller did not provide an accepted name.",
			points: PROMPT1_NAME_DEDUCTION
		});
	}

	if (!evaluation.reasonAccepted) {
		deductions.push({
			source: "OpenAI",
			finding: "reason",
			reason:
				"The caller did not provide an accepted reason for calling.",
			points: PROMPT1_REASON_DEDUCTION
		});
	}

	return deductions;
}

function recoverCallerResponseDeductions(
	initialDeductions: Block3Deduction[],
	secondEvaluation: CallerResponseResult
): {
	remaining: Block3Deduction[];
	recovered: Block3RecoveredDeduction[];
} {
	const remaining: Block3Deduction[] = [];
	const recovered: Block3RecoveredDeduction[] = [];

	for (const deduction of initialDeductions) {
		const corrected =
			(
				deduction.finding === "name" &&
				secondEvaluation.nameAccepted
			) ||
			(
				deduction.finding === "reason" &&
				secondEvaluation.reasonAccepted
			);

		if (corrected) {
			recovered.push({
				source: "OpenAI",
				finding: deduction.finding,
				points: deduction.points
			});
		} else {
			remaining.push(deduction);
		}
	}

	return {
		remaining,
		recovered
	};
}

function createPrompt2Deductions(
	evaluation: CallerResponseResult
): Block3Deduction[] {
	const deductions: Block3Deduction[] = [];

	if (!evaluation.nameAccepted) {
		deductions.push({
			source: "OpenAI",
			finding: "prompt2_name",
			reason:
				"The caller did not provide an accepted name in Prompt 2.",
			points: PROMPT2_NAME_DEDUCTION
		});
	}

	if (!evaluation.reasonAccepted) {
		deductions.push({
			source: "OpenAI",
			finding: "prompt2_reason",
			reason:
				"The caller did not provide an accepted reason for calling in Prompt 2.",
			points: PROMPT2_REASON_DEDUCTION
		});
	}

	return deductions;
}

function createCrossedResponseDeduction(
	prompt1: CallerResponseResult,
	prompt2: CallerResponseResult
): Block3Deduction[] {
	const patternA =
		!prompt1.nameAccepted
		&& prompt1.reasonAccepted
		&& prompt2.nameAccepted
		&& !prompt2.reasonAccepted;
	const patternB =
		prompt1.nameAccepted
		&& !prompt1.reasonAccepted
		&& !prompt2.nameAccepted
		&& prompt2.reasonAccepted;

	return patternA || patternB
		? [{
			source: "OpenAI",
			finding: "complete_response",
			reason:
				"Neither caller response contained both an accepted name and an accepted reason for calling.",
			points:
				COMPLETE_RESPONSE_DEFICIENCY_DEDUCTION
		}]
		: [];
}

function createIpqsDeductions(
	result: IpqsLookupResult
): Block3Deduction[] {
	const deductions: Block3Deduction[] = [];

	if (result.valid === false) {
		deductions.push({
			source: "IPQS",
			finding: "valid",
			reason:
				"IPQS returned valid = false.",
			points: IPQS_FIELD_DEDUCTION
		});
	}

	if (result.active === false) {
		deductions.push({
			source: "IPQS",
			finding: "active",
			reason:
				"IPQS returned active = false.",
			points: IPQS_FIELD_DEDUCTION
		});
	}

	if (result.recent_abuse === true) {
		deductions.push({
			source: "IPQS",
			finding: "recent_abuse",
			reason:
				"IPQS returned recent_abuse = true.",
			points: IPQS_FIELD_DEDUCTION
		});
	}

	if (result.spammer === true) {
		deductions.push({
			source: "IPQS",
			finding: "spammer",
			reason:
				"IPQS returned spammer = true.",
			points: IPQS_FIELD_DEDUCTION
		});
	}

	return deductions;
}

export async function completeBlock3(
	input: Block3Input
): Promise<Block3EvidenceBox> {
	await input.callController.startRecording();

	let recordingCompleted = false;

	try {
		const prompt1Evaluation =
			await evaluateCallerResponse(
				input.prompt1.transcript,
				input.prompt1.language,
				input.evaluator
			);

		const prompt1: Block3PromptResult = {
			...input.prompt1,
			evaluation: prompt1Evaluation
		};

		const block2Deductions =
			input.block2EvidenceBox.deductions;

		const initialCallerResponseDeductions =
			createPrompt1Deductions(
				prompt1Evaluation
			);

		const standingAfterFirstResponse =
			calculateStanding(
				input.block2EvidenceBox
					.startingStanding,
				[
					...block2Deductions,
					...initialCallerResponseDeductions
				]
			);
		if (
			prompt1Evaluation.nameAccepted &&
			prompt1Evaluation.reasonAccepted
		) {
			const allDeductions = [
				...block2Deductions
			];

			const finalStanding =
				calculateStanding(
					input.block2EvidenceBox
						.startingStanding,
					allDeductions
				);

			await input.callController
				.connectSubscriber();

			await input.callController
				.stopRecording();

			recordingCompleted = true;

			return {
				block2EvidenceBox:
					input.block2EvidenceBox,
				prompt1,
				prompt2: null,
				block2Deductions,
				initialCallerResponseDeductions: [],
				recoveredCallerResponseDeductions: [],
				block3Deductions: [],
				ipqsPerformed: false,
				ipqsResult: null,
				ipqsDeductions: [],
				allDeductions,
				standingAfterFirstResponse,
				finalStanding,
				callResult: "connected",
				recordingCompleted
			};
		}

		if (!input.prompt2) {
			throw new Error(
				"Prompt 2 evidence is required after an incomplete first response."
			);
		}

		const prompt2Evaluation =
			await evaluateCallerResponse(
				input.prompt2.transcript,
				input.prompt2.language,
				input.evaluator
			);

		const prompt2: Block3PromptResult = {
			...input.prompt2,
			evaluation: prompt2Evaluation
		};

		const recovery =
			recoverCallerResponseDeductions(
				initialCallerResponseDeductions,
				prompt2Evaluation
			);
		const prompt2Deductions =
			createPrompt2Deductions(
				prompt2Evaluation
			);
		const crossedResponseDeductions =
			createCrossedResponseDeduction(
				prompt1Evaluation,
				prompt2Evaluation
			);
		const block3Deductions = [
			...recovery.remaining,
			...prompt2Deductions,
			...crossedResponseDeductions
		];
		const standingAfterPrompt2 =
			calculateStanding(
				input.block2EvidenceBox
					.startingStanding,
				[
					...block2Deductions,
					...block3Deductions
				]
			);
		const ipqsEligible =
			isIpqsEligibleStanding(
				standingAfterPrompt2
			);

		if (ipqsEligible && !input.ipqsLookup) {
			throw new Error(
				"IPQS lookup is required when the standing after Prompt 2 is between 76 and 85."
			);
		}

		const ipqsResult = ipqsEligible
			? await input.ipqsLookup!.lookup(
				input.block2EvidenceBox
			)
			: null;

		const ipqsDeductions = ipqsResult
			? createIpqsDeductions(ipqsResult)
			: [];

		const allDeductions = [
			...block2Deductions,
			...block3Deductions,
			...ipqsDeductions
		];

		const finalStanding =
			calculateStanding(
				input.block2EvidenceBox
					.startingStanding,
				allDeductions
			);

		const callResult: Block3CallResult =
			finalStanding >= RELEASE_THRESHOLD
				? "connected"
				: "diverted";

		if (callResult === "connected") {
			await input.callController
				.connectSubscriber();
		} else {
			await input.callController
				.playUnavailableAndDisconnect();
		}

		await input.callController.stopRecording();

		recordingCompleted = true;

		return {
			block2EvidenceBox:
				input.block2EvidenceBox,
			prompt1,
			prompt2,
			block2Deductions,
			initialCallerResponseDeductions,
			recoveredCallerResponseDeductions:
				recovery.recovered,
			block3Deductions,
			ipqsPerformed: ipqsEligible,
			ipqsResult,
			ipqsDeductions,
			allDeductions,
			standingAfterFirstResponse,
			finalStanding,
			callResult,
			recordingCompleted
		};
	} catch (error) {
		await input.callController
			.playTechnicalDifficultiesAndDisconnect();
		throw error;
	} finally {
		if (!recordingCompleted) {
			await input.callController
				.stopRecording();
		}
	}
}
