import { describe, expect, it, vi } from "vitest";
import {
	extractCallerResponse,
	type CallerResponseExtractor
} from "../src/services/evidenceEngine";

describe("Evidence Engine response extraction", () => {
	it("returns the name and reason supplied by the extractor", async () => {
		const extractor: CallerResponseExtractor = {
			extract: vi.fn().mockResolvedValue({
				name: "Maria",
				reason: "Calling about the appointment"
			})
		};

		const result = await extractCallerResponse(
			"This is Maria calling about the appointment.",
			"en",
			extractor
		);

		expect(result).toEqual({
			name: "Maria",
			reason: "Calling about the appointment"
		});

		expect(extractor.extract).toHaveBeenCalledWith({
			transcript: "This is Maria calling about the appointment.",
			language: "en"
		});
	});

	it("allows extracted values to remain missing", async () => {
		const extractor: CallerResponseExtractor = {
			extract: vi.fn().mockResolvedValue({
				name: null,
				reason: null
			})
		};

		const result = await extractCallerResponse(
			"Hello.",
			null,
			extractor
		);

		expect(result).toEqual({
			name: null,
			reason: null
		});
	});

	it("returns empty extraction results without calling the extractor", async () => {
		const extractor: CallerResponseExtractor = {
			extract: vi.fn()
		};

		const result = await extractCallerResponse(
			"   ",
			"en",
			extractor
		);

		expect(result).toEqual({
			name: null,
			reason: null
		});

		expect(extractor.extract).not.toHaveBeenCalled();
	});
});
