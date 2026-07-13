export interface CallerResponseFacts {
	transcript: string;
	language: string | null;
	nameProvided: boolean;
	reasonProvided: boolean;
}

export function createCallerResponseFacts(
	transcript: string,
	language: string | null,
	nameProvided: boolean,
	reasonProvided: boolean
): CallerResponseFacts {
	return {
		transcript,
		language,
		nameProvided,
		reasonProvided
	};
}
