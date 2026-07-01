import { describe, expect, it } from "vitest";
import { executeTelnyxRequest } from "../src/services/telnyxExecutor";
import type { SimulatedTelnyxRequest } from "../src/services/telnyxRequests";
import type { TelnyxExecutionPolicy } from "../src/services/telnyxExecutionPolicy";

describe("Telnyx executor", () => {
	it("refuses to execute a request that is not marked liveApiReady", async () => {
		const request: SimulatedTelnyxRequest = {
			mode: "simulated",
			method: "POST",
			endpoint: "/calls/test-call-control-id/actions/transfer",
			body: {},
			metadata: {
				liveApiReady: false,
				command: "transfer"
			},
			safetyNote: "Simulation-only request."
		};

		const policy: TelnyxExecutionPolicy = {
			liveExecutionAllowed: true,
			reason: "Test policy allows live execution."
		};

		const result = await executeTelnyxRequest(request, policy, {
			apiKey: "test-api-key"
		});

		expect(result.mode).toBe("disabled");
		expect(result.executed).toBe(false);
		expect(result.reason).toBe(
			"Telnyx live execution was requested, but this request is not explicitly marked liveApiReady."
		);
	});
});
