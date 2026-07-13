import { describe, expect, it } from "vitest";
import { evaluateCurrentCall } from "../src/services/evidenceEngine";

describe("Evidence Engine", () => {
	it("starts every call at 100", () => {
		const result = evaluateCurrentCall({
			deductions: []
		});

		expect(result.initialStanding).toBe(100);
		expect(result.currentStanding).toBe(100);
		expect(result.nextStep).toBe("release");
	});

	it("releases a call at 86 without requesting IPQS", () => {
		const result = evaluateCurrentCall({
			deductions: [
				{
					source: "stage_1",
					reason: "objective_evidence_deduction",
					points: 14
				}
			]
		});

		expect(result.currentStanding).toBe(86);
		expect(result.nextStep).toBe("release");
	});

	it("requests IPQS at the upper boundary of 85", () => {
		const result = evaluateCurrentCall({
			deductions: [
				{
					source: "response_comparison",
					reason: "borderline_current_call_evidence",
					points: 15
				}
			]
		});

		expect(result.currentStanding).toBe(85);
		expect(result.nextStep).toBe("request_ipqs");
	});

	it("requests IPQS at the lower boundary of 76", () => {
		const result = evaluateCurrentCall({
			deductions: [
				{
					source: "caller_response",
					reason: "poor_first_response",
					points: 24
				}
			]
		});

		expect(result.currentStanding).toBe(76);
		expect(result.nextStep).toBe("request_ipqs");
	});

	it("releases a call at 76 after IPQS is complete", () => {
		const result = evaluateCurrentCall({
			ipqsCompleted: true,
			deductions: [
				{
					source: "caller_response",
					reason: "poor_first_response",
					points: 24
				}
			]
		});

		expect(result.currentStanding).toBe(76);
		expect(result.nextStep).toBe("release");
	});

	it("continues observation at 75 or below", () => {
		const result = evaluateCurrentCall({
			deductions: [
				{
					source: "caller_response",
					reason: "unusable_requested_information",
					points: 25
				}
			]
		});

		expect(result.currentStanding).toBe(75);
		expect(result.nextStep).toBe("continue_observation");
	});

	it("applies IPQS deductions before final determination", () => {
		const result = evaluateCurrentCall({
			ipqsCompleted: true,
			deductions: [
				{
					source: "caller_response",
					reason: "borderline_response",
					points: 15
				},
				{
					source: "ipqs",
					reason: "material_external_risk_finding",
					points: 10
				}
			]
		});

		expect(result.currentStanding).toBe(75);
		expect(result.nextStep).toBe("continue_observation");
	});

	it("rejects invalid negative deductions", () => {
		expect(() => {
			evaluateCurrentCall({
				deductions: [
					{
						source: "stage_1",
						reason: "invalid",
						points: -5
					}
				]
			});
		}).toThrow(
			"Evidence deductions must use non-negative finite points."
		);
	});
});
