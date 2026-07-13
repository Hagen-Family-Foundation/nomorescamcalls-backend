import { describe, expect, it } from "vitest";
import {
	createCallerResponseFacts
} from "../src/services/evidenceEngine";

describe("Evidence Engine response facts", () => {
	it("stores normalized caller response facts", () => {
		const result = createCallerResponseFacts(
			"This is Maria calling about the appointment.",
			"en",
			true,
			true
		);

		expect(result).toEqual({
			transcript: "This is Maria calling about the appointment.",
			language: "en",
			nameProvided: true,
			reasonProvided: true
		});
	});

	it("allows the language to remain unknown", () => {
		const result = createCallerResponseFacts(
			"",
			null,
			false,
			false
		);

		expect(result.language).toBeNull();
		expect(result.nameProvided).toBe(false);
		expect(result.reasonProvided).toBe(false);
	});
});
