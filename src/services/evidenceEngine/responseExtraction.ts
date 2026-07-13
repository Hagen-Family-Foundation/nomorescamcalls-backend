export interface CallerResponseExtractionInput {
	transcript: string;
	language: string | null;
}

export interface ExtractedCallerResponse {
	name: string | null;
	reason: string | null;
}

export interface CallerResponseExtractor {
	extract(
		input: CallerResponseExtractionInput
	): Promise<ExtractedCallerResponse>;
}

export async function extractCallerResponse(
	transcript: string,
	language: string | null,
	extractor: CallerResponseExtractor
): Promise<ExtractedCallerResponse> {
	if (transcript.trim() === "") {
		return {
			name: null,
			reason: null
		};
	}

	return extractor.extract({
		transcript,
		language
	});
}
