export interface CallerResponseInput {
	transcript: string;
	language: string | null;
}

export interface CallerResponseEvaluation {
	nameAccepted: boolean;
	reasonAccepted: boolean;
	extractedName: string | null;
	extractedReason: string | null;
}

export interface CallerResponseEvaluator {
	evaluate(
		input: CallerResponseInput
	): Promise<CallerResponseEvaluation>;
}

export interface CallerResponseResult
	extends CallerResponseInput,
		CallerResponseEvaluation {}

export async function evaluateCallerResponse(
	transcript: string,
	language: string | null,
	evaluator: CallerResponseEvaluator
): Promise<CallerResponseResult> {
	if (transcript.trim() === "") {
		return {
			transcript,
			language,
			nameAccepted: false,
			reasonAccepted: false,
			extractedName: null,
			extractedReason: null
		};
	}

	const evaluation = await evaluator.evaluate({
		transcript,
		language
	});

	return {
		transcript,
		language,
		nameAccepted: evaluation.nameAccepted,
		reasonAccepted: evaluation.reasonAccepted,
		extractedName: evaluation.extractedName ?? null,
		extractedReason: evaluation.extractedReason ?? null
	};
}
