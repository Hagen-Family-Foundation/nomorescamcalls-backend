import {
	describe,
	expect,
	it,
	vi
} from "vitest";
import {
	handleTelnyxWebhook
} from "../src/services/telnyxWebhookHandler";

function database(
	resolution: {
		protectedLine: Record<string, unknown>;
		account: Record<string, unknown>;
	} | null = null
): D1Database {
	return {
		prepare: vi.fn((query: string) => ({
			bind: vi.fn(() => ({
				first: vi.fn(async () => {
					if (query.includes("FROM protected_lines")) {
						return resolution?.protectedLine ?? null;
					}
					if (query.includes("FROM users")) {
						return resolution?.account ?? null;
					}
					return null;
				}),
				run: vi.fn(async () => ({}))
			}))
		}))
	} as unknown as D1Database;
}

function protectedLineResolution(
	callerFacingBusinessName: string | null,
	lineId = 10,
	accountId = 1,
	screeningNumber = "+15550002001"
) {
	return {
		protectedLine: {
			id: lineId,
			user_id: accountId,
			location_id: 100,
			protected_phone_number: "+15550003001",
			caller_facing_business_name: callerFacingBusinessName,
			carrier: null,
			screening_number: screeningNumber,
			sip_username: `protected_line_${lineId}`,
			provisioning_status: "provisioned",
			coverage_status: "active",
			created_at: "2026-01-01T00:00:00Z",
			updated_at: "2026-01-01T00:00:00Z"
		},
		account: {
			id: accountId,
			first_name: "Account",
			last_name: "Owner",
			caller_facing_business_name: null,
			email: "owner@example.com",
			contact_phone_number: "+15550004001",
			phone_number: "+15550004001",
			screening_number: null,
			sip_username: null,
			carrier: null,
			contact_method: "email",
			role: "participant",
			account_status: "active",
			setup_status: "onboarding_complete",
			status: "active",
			coverage_status: "inactive"
		}
	};
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
		const resolvedLine = protectedLineResolution("Hagen & Son's Plumbing");
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
				database(resolvedLine),
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
			"Thank you for calling Hagen & Son's Plumbing. Please say your name and reason for calling so that we may route your call appropriately. Thank you."
		);
		expect(result.firstRequest.body.payload).not.toMatch(/NoMoreScamCalls|NMSC/);
		expect(
			result.firstRequest.metadata
				.speechTimeoutSeconds
		).toBe(5);
		expect(result.firstRequest.body).not.toHaveProperty(
			"timeout_seconds"
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
		expect(initialization.subscriber).toMatchObject({
			id: 1,
			protectedLineId: 10,
			name: "Account Owner",
			callerFacingBusinessName: "Hagen & Son's Plumbing",
			screeningNumber: "+15550002001"
		});
	});

	it("uses each resolved protected line's distinct caller-facing phrase without adding account or location wording", async () => {
		const call = async (businessName: string, sessionId: string) => {
			const sessions = liveSessions();
			const response = await handleTelnyxWebhook({
				data: {
					event_type: "call.initiated",
					payload: {
						call_control_id: `control-${sessionId}`,
						call_session_id: sessionId,
						from: "+15550001001",
						to: `+1555${sessionId === "one" ? "0002001" : "0002002"}`
					}
				}
		}, database(protectedLineResolution(
			businessName,
			sessionId === "one" ? 11 : 12,
			1,
			sessionId === "one" ? "+15550002001" : "+15550002002"
		)), disabledPolicy, {}, sessions.namespace);
			return (await response.json() as any).firstRequest.body.payload as string;
		};

		const first = await call("ABC Auto Repair", "one");
		const second = await call("Hagen Home Services", "two");

		expect(first).toContain("ABC Auto Repair");
		expect(second).toContain("Hagen Home Services");
		expect(first).not.toContain("Legal Account Name");
		expect(second).not.toContain("Legal Account Name");
	});

	it("does not substitute another identity when the caller-facing business name is missing", async () => {
		const response = await handleTelnyxWebhook({
			data: {
				event_type: "call.initiated",
				payload: {
					call_control_id: "control-missing-name",
					call_session_id: "session-missing-name",
					from: "+15550001001",
					to: "+15550002001"
				}
			}
		}, database(protectedLineResolution(null, 13, 3)), disabledPolicy);

		expect(response.status).toBe(409);
		expect(await response.json()).toMatchObject({
			screened: false,
			reason: "caller_facing_business_name_unavailable"
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

	it("returns success when a completed Block 3 session ignores a late transcript", async () => {
		const fetch = vi.fn(async () => Response.json({
			accepted: false,
			completed: true
		}));
		const response = await handleTelnyxWebhook(
			{
				data: {
					event_type: "call.transcription",
					payload: {
						call_control_id: "live-control-id",
						call_session_id: "live-session-id",
						transcription_data: {
							is_final: true,
							transcript: "late final segment"
						}
					}
				}
			},
			database(),
			disabledPolicy,
			{},
			{ getByName: vi.fn(() => ({ fetch })) }
		);

		expect(response.status).toBe(200);
		const result = await response.json() as any;
		expect(result.liveSession).toEqual({
			accepted: false,
			completed: true
		});
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

	it("routes only the correlated unavailable-message completion to finalization", async () => {
		const sessions = liveSessions();
		const response = await handleTelnyxWebhook(
			{
				data: {
					event_type: "call.speak.ended",
					payload: {
						call_control_id: "live-control-id",
						call_session_id: "live-session-id",
						client_state:
							"YmxvY2szX3VuYXZhaWxhYmxlX21lc3NhZ2U="
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
			"block3_unavailable_playback_processed"
		);
		expect(
			new URL(sessions.fetch.mock.calls[0][0].url).pathname
		).toBe("/unavailable-speak-ended");
	});

	it("does not mistake another client_state for unavailable-message completion", async () => {
		const sessions = liveSessions();
		await handleTelnyxWebhook(
			{
				data: {
					event_type: "call.speak.ended",
					payload: {
						call_control_id: "live-control-id",
						call_session_id: "live-session-id",
						client_state: "technical-message"
					}
				}
			},
			database(),
			disabledPolicy,
			{},
			sessions.namespace
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
