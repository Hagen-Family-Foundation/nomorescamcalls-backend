export interface CallerResponseInput {
	transcript: string;
	language: string | null;
}

export interface CallerResponseEvaluation {
	nameAccepted: boolean;
	reasonAccepted: boolean;
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
			reasonAccepted: false
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
		reasonAccepted: evaluation.reasonAccepted
	};
}
