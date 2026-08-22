import {
	describe,
	expect,
	it
} from "vitest";
import {
	buildTelnyxRequest
} from "../src/services/telnyxRequests";
import type {
	TelnyxPlannedCommand
} from "../src/services/telnyxCommands";

function command(
	command:
		TelnyxPlannedCommand["command"]
): TelnyxPlannedCommand {
	return {
		mode: "simulated",
		command,
		callControlId:
			"test-call-control-id",
		callSessionId:
			"test-call-session-id",
		reason: "test",
		safetyNote: "test"
	};
}

describe("Telnyx request builder", () => {
	it("builds an answer request", () => {
		const request =
			buildTelnyxRequest(
				command("answer"),
				null
			);

		expect(request?.method).toBe(
			"POST"
		);

		expect(request?.endpoint).toBe(
			"/calls/test-call-control-id/actions/answer"
		);

		expect(
			request?.metadata.liveApiReady
		).toBe(true);
	});

	it("builds a transfer request for an approved app destination", () => {
		const request =
			buildTelnyxRequest(
				command("transfer"),
				null,
				{
					destinationType: "app",
					destination:
						"test_user_18005550101",
					screeningNumber:
						"+18005550000",
					reason:
						"test approved destination"
				}
			);

		expect(request?.method).toBe(
			"POST"
		);

		expect(request?.endpoint).toBe(
			"/calls/test-call-control-id/actions/transfer"
		);

		expect(request?.body.to).toBe(
			"sip:test_user_18005550101@sip.telnyx.com"
		);

		expect(request?.body.from).toBe(
			"+18005550000"
		);

		expect(
			request?.metadata.liveApiReady
		).toBe(true);
	});

	it("builds a hangup request", () => {
		const request =
			buildTelnyxRequest(
				command("hangup"),
				null
			);

		expect(request?.method).toBe(
			"POST"
		);

		expect(request?.endpoint).toBe(
			"/calls/test-call-control-id/actions/hangup"
		);

		expect(request?.body).toEqual({});
	});

	it("builds a native transcription start request", () => {
		const request =
			buildTelnyxRequest(
				command(
					"transcription_start"
				),
				null
			);

		expect(request?.method).toBe(
			"POST"
		);

		expect(request?.endpoint).toBe(
			"/calls/test-call-control-id/actions/transcription_start"
		);

		expect(request?.body).toEqual({
			language: "en"
		});

		expect(request?.metadata).toMatchObject({
			liveApiReady: true,
			command: "transcription_start"
		});
	});

	it("builds the approved first speech request", () => {
		const request =
			buildTelnyxRequest(
				command("gather"),
				{
					prompt:
						"State your name and reason for calling please.",
					timeoutSeconds: 5
				}
			);

		expect(request?.method).toBe(
			"POST"
		);

		expect(request?.endpoint).toBe(
			"/calls/test-call-control-id/actions/speak"
		);

		expect(
			request?.body.payload
		).toBe(
			"State your name and reason for calling please."
		);

		expect(
			request?.metadata.speechPrompt
		).toBe(
			"State your name and reason for calling please."
		);

		expect(
			request?.metadata
				.speechTimeoutSeconds
			).toBe(5);
		expect(request?.body).not.toHaveProperty(
			"timeout_seconds"
		);
	});

	it("requires speech information for a caller request", () => {
		expect(() =>
			buildTelnyxRequest(
				command("gather"),
				null
			)
		).toThrow(
			"Speech request is required for caller-response collection."
		);
	});

	it("adds client_state only when a speech playback requires correlation", () => {
		const correlated = buildTelnyxRequest(
			command("speak"),
			{
				prompt: "Correlated message",
				timeoutSeconds: 10,
				clientState: "playback-marker"
			}
		);
		const ordinary = buildTelnyxRequest(
			command("speak"),
			{
				prompt: "Ordinary message",
				timeoutSeconds: 10
			}
		);

		expect(correlated?.body.client_state).toBe(
			"playback-marker"
		);
		expect(ordinary?.body).not.toHaveProperty(
			"client_state"
		);
	});

	it("returns null for noop", () => {
		const request =
			buildTelnyxRequest(
				command("noop"),
				null
			);

		expect(request).toBeNull();
	});
});
