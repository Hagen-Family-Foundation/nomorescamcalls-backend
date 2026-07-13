import { describe, expect, it } from "vitest";
import {
	EVIDENCE,
	type EvidenceType
} from "../src/services/evidenceEngine";

describe("Evidence Engine catalog", () => {
	it("defines the current-call evidence vocabulary", () => {
		const evidence: EvidenceType[] = Object.values(EVIDENCE);

		expect(evidence).toContain("stage_1_objective");
		expect(evidence).toContain("first_response_name_missing");
		expect(evidence).toContain("second_response_reason_missing");
		expect(evidence).toContain("ipqs_finding");
	});

	it("contains no duplicate evidence values", () => {
		const evidence = Object.values(EVIDENCE);

		expect(new Set(evidence).size).toBe(evidence.length);
	});
});
