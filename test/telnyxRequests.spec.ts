import { describe, expect, it } from "vitest";
import { buildTelnyxRequest } from "../src/services/telnyxRequests";
import type { TelnyxPlannedCommand } from "../src/services/telnyxCommands";

function command(command: TelnyxPlannedCommand["command"]): TelnyxPlannedCommand {
	return {
		mode: "simulated",
		command,
		callControlId: "test-call-control-id",
		callSessionId: "test-call-session-id",
		reason: "test",
		safetyNote: "test"
	};
}

describe("Telnyx request builder", () => {

	it("builds an answer request", () => {
		const request = buildTelnyxRequest(command("answer"), null);

		expect(request?.method).toBe("POST");
		expect(request?.endpoint).toBe("/calls/test-call-control-id/actions/answer");
		expect(request?.body.liveApiReady).toBe(true);
	});


	it("builds a transfer request for an approved app destination", () => {
		const request = buildTelnyxRequest(
			command("transfer"),
			null,
			{
				destinationType: "app",
				destination: "user_18165550001",
				screeningNumber: "+18165550000",
				reason: "test approved destination"
			}
		);

		expect(request?.method).toBe("POST");
		expect(request?.endpoint).toBe("/calls/test-call-control-id/actions/transfer");
		expect(request?.body.to).toBe("sip:user_18165550001@sip.telnyx.com");
		expect(request?.body.from).toBe("+18165550000");
		expect(request?.body.liveApiReady).toBe(true);
	});

	it("builds a hangup request", () => {
		const request = buildTelnyxRequest(command("hangup"), null);

		expect(request?.method).toBe("POST");
		expect(request?.endpoint).toBe("/calls/test-call-control-id/actions/hangup");
		expect(request?.body).toEqual({});
	});

	it("builds a gather using speak request", () => {
		const request = buildTelnyxRequest(
			command("gather"),
			{
				prompt: "Please press 5 to continue.",
				expectedInput: "5",
				maxAttempts: 1,
				timeoutSeconds: 5
			}
		);

		expect(request?.method).toBe("POST");
		expect(request?.endpoint).toBe("/calls/test-call-control-id/actions/gather_using_speak");
		expect(request?.body.prompt).toBe("Please press 5 to continue.");
		expect(request?.body.expectedInput).toBe("5");
	});

	it("returns null for noop", () => {
		const request = buildTelnyxRequest(command("noop"), null);

		expect(request).toBeNull();
	});
});
