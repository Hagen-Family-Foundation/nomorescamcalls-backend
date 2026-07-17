const MISSING_NAME_DEDUCTION = 15;
const MISSING_REASON_DEDUCTION = 15;

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

export interface CallerResponseResult extends CallerResponseEvaluation {
	transcript: string;
	language: string | null;
	deduction: number;
}

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
			deduction:
				MISSING_NAME_DEDUCTION +
				MISSING_REASON_DEDUCTION
		};
	}

	const evaluation = await evaluator.evaluate({
		transcript,
		language
	});

	let deduction = 0;

	if (!evaluation.nameAccepted) {
		deduction += MISSING_NAME_DEDUCTION;
	}

	if (!evaluation.reasonAccepted) {
		deduction += MISSING_REASON_DEDUCTION;
	}

	return {
		transcript,
		language,
		...evaluation,
		deduction
	};
}
