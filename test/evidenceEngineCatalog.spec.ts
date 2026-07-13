import { describe, expect, it } from "vitest";
import {
	EVIDENCE_CATEGORY,
	type EvidenceCategory
} from "../src/services/evidenceEngine";

describe("Evidence Engine catalog", () => {
	it("defines the four evidence categories", () => {
		const categories: EvidenceCategory[] =
			Object.values(EVIDENCE_CATEGORY);

		expect(categories).toEqual([
			"stage_1",
			"caller_response",
			"response_timing",
			"external"
		]);
	});

	it("contains no duplicate category values", () => {
		const categories = Object.values(EVIDENCE_CATEGORY);

		expect(new Set(categories).size).toBe(categories.length);
	});
});
