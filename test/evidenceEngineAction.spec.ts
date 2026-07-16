import { describe, expect, it } from "vitest";
import { determineAction } from "../src/services/evidenceEngine/action";

describe("Evidence Engine action", () => {
	it("releases above the IPQS range", () => {
		expect(
			determineAction({
				standing: 86,
				ipqsCompleted: false
			})
		).toBe("release");
	});

	it("requests IPQS within the range", () => {
		expect(
			determineAction({
				standing: 85,
				ipqsCompleted: false
			})
		).toBe("ipqs");

		expect(
			determineAction({
				standing: 76,
				ipqsCompleted: false
			})
		).toBe("ipqs");
	});

	it("releases after IPQS if still passing", () => {
		expect(
			determineAction({
				standing: 76,
				ipqsCompleted: true
			})
		).toBe("release");
	});

	it("observes below the threshold", () => {
		expect(
			determineAction({
				standing: 75,
				ipqsCompleted: false
			})
		).toBe("observe");
	});
});
