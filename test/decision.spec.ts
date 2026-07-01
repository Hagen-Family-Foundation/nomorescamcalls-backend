import { describe, expect, it } from "vitest";
import { decideAction } from "../src/services/decision";

describe("screening decision rules", () => {
	it("allows repeated callers when frequency is the only risk signal", () => {
		const result = decideAction(35, { signalScore: 0 });

		expect(result.action).toBe("allow");
		expect(result.reason).toBe("frequency_without_suspicious_signal_allow");
	});

	it("challenges callers when elevated risk includes suspicious signal evidence", () => {
		const result = decideAction(35, { signalScore: 10 });

		expect(result.action).toBe("challenge");
		expect(result.reason).toBe("risk_challenge");
	});

	it("blocks high-confidence scam risk", () => {
		const result = decideAction(95, { signalScore: 0 });

		expect(result.action).toBe("block");
		expect(result.reason).toBe("high_confidence_block");
	});
});
