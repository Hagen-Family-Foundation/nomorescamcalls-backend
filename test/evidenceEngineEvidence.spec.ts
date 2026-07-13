import { describe, expect, it } from "vitest";
import { createCallEvidence } from "../src/services/evidenceEngine";
import { recordEvidence } from "../src/services/evidenceEngine/evidence";

describe("Evidence Engine evidence", () => {
	it("records evidence and keeps a passing call released", () => {
		const result = recordEvidence(createCallEvidence(), {
			source: "stage_1",
			reason: "minor concern",
			points: 5
		});

		expect(result.call.standing).toBe(95);
		expect(result.call.deductions).toHaveLength(1);
		expect(result.action).toBe("release");
	});

	it("records evidence that requires IPQS", () => {
		const result = recordEvidence(createCallEvidence(), {
			source: "caller_response",
			reason: "borderline evidence",
			points: 20
		});

		expect(result.call.standing).toBe(80);
		expect(result.action).toBe("ipqs");
	});

	it("records evidence that moves the call into observation", () => {
		const result = recordEvidence(createCallEvidence(), {
			source: "response_comparison",
			reason: "high risk evidence",
			points: 30
		});

		expect(result.call.standing).toBe(70);
		expect(result.action).toBe("observe");
	});
});
