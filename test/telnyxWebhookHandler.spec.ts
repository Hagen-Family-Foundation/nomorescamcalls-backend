import {
	describe,
	expect,
	it,
	vi
} from "vitest";
import {
	handleTelnyxWebhook
} from "../src/services/telnyxWebhookHandler";

function database(): D1Database {
	return {
		prepare: vi.fn(() => ({
			bind: vi.fn(() => ({
				first: vi.fn(async () => null),
				run: vi.fn(async () => ({}))
			}))
		}))
	} as unknown as D1Database;
}

const disabledPolicy = {
	mode: "disabled" as const,
	liveExecutionAllowed: false,
	reason: "Test execution is disabled."
};

function liveSessions() {
	const fetch = vi.fn(async (request: Request) =>
		Response.json({
			path: new URL(request.url).pathname
		})
	);
	const getByName = vi.fn(() => ({ fetch }));

	return {
		namespace: { getByName },
		getByName,
		fetch
	};
}

describe("Telnyx webhook native transcription path", () => {
	it("plans answer, native transcription, then the approved first request", async () => {
		const sessions = liveSessions();
		const response =
			await handleTelnyxWebhook(
				{
					data: {
						event_type:
							"call.initiated",
						payload: {
							call_control_id:
								"live-control-id",
							call_session_id:
								"live-session-id",
							from:
								"+15550001001",
							to:
								"+15550002001"
						}
					}
				},
				database(),
				disabledPolicy,
				{},
				sessions.namespace
			);

		const result =
			await response.json() as any;

		expect(result.answerRequest.endpoint).toBe(
			"/calls/live-control-id/actions/answer"
		);
		expect(
			result.transcriptionRequest.endpoint
		).toBe(
			"/calls/live-control-id/actions/transcription_start"
		);
		expect(result.recordingRequest.endpoint).toBe(
			"/calls/live-control-id/actions/record_start"
		);
		expect(result.firstRequest.endpoint).toBe(
			"/calls/live-control-id/actions/speak"
		);
		expect(result.firstRequest.body.payload).toBe(
			"State your name and reason for calling please."
		);
		expect(sessions.getByName).toHaveBeenCalledWith(
			"live-session-id"
		);
		expect(
			new URL(sessions.fetch.mock.calls[0][0].url).pathname
		).toBe("/initialize");
		const initialization = JSON.parse(
			await sessions.fetch.mock.calls[0][0].clone().text()
		);
		expect(
			initialization.block2EvidenceBox
				.callingNumberInformation
		).toEqual({
			phoneNumber: "+15550001001"
		});
		expect(
			initialization.block2EvidenceBox.startingStanding
		).toBe(100);
		expect(initialization.callInformation).toMatchObject({
			callSessionId: "live-session-id",
			callControlId: "live-control-id",
			callingNumber: "+15550001001",
			cnam: null,
			carrier: null,
			lineType: null,
			country: null
		});
	});

	it("delivers a final correlated transcript toward Block 3", async () => {
		const sessions = liveSessions();
		const response =
			await handleTelnyxWebhook(
				{
					data: {
						event_type:
							"call.transcription",
						payload: {
							call_control_id:
								"live-control-id",
							call_session_id:
								"live-session-id",
							transcription_data: {
								confidence: 0.98,
								is_final: true,
								transcript:
									"Kelly calling about the inspection."
							}
						}
					}
				},
				database(),
				disabledPolicy,
				{},
				sessions.namespace
			);

		const result =
			await response.json() as any;

		expect(result.reason).toBe(
			"final_transcript_ready_for_block_3"
		);
		expect(result.transcriptEvidence).toEqual({
			callControlId: "live-control-id",
			callSessionId: "live-session-id",
			promptEvidence: {
				audioRecordingReference: null,
				transcript:
					"Kelly calling about the inspection.",
				language: null
			},
			confidence: 0.98
		});
		expect(sessions.getByName).toHaveBeenCalledWith(
			"live-session-id"
		);
		expect(
			new URL(sessions.fetch.mock.calls[0][0].url).pathname
		).toBe("/transcription");
	});

	it("opens the response window after Telnyx finishes speaking", async () => {
		const sessions = liveSessions();
		const response = await handleTelnyxWebhook(
			{
				data: {
					event_type: "call.speak.ended",
					payload: {
						call_control_id: "live-control-id",
						call_session_id: "live-session-id"
					}
				}
			},
			database(),
			disabledPolicy,
			{},
			sessions.namespace
		);

		const result = await response.json() as any;
		expect(result.reason).toBe(
			"block3_response_window_opened"
		);
		expect(sessions.getByName).toHaveBeenCalledWith(
			"live-session-id"
		);
		expect(
			new URL(sessions.fetch.mock.calls[0][0].url).pathname
		).toBe("/prompt-started");
	});

	it("leaves unrelated events on the existing no-op path", async () => {
		const response =
			await handleTelnyxWebhook(
				{
					data: {
						event_type:
							"call.answered",
						payload: {
							call_control_id:
								"live-control-id",
							call_session_id:
								"live-session-id"
						}
					}
				},
				database(),
				disabledPolicy
			);

		const result =
			await response.json() as any;

		expect(result).toMatchObject({
			received: true,
			screened: false,
			reason: "event_type_not_processed"
		});
	});
});
