import {
	afterEach,
	describe,
	expect,
	it,
	vi
} from "vitest";
import {
	Block3LiveSession,
	UNAVAILABLE_MESSAGE_CLIENT_STATE
} from "../src/services/block3LiveSession";
import type {
	Block3CallController,
	CallerResponseEvaluator,
	IpqsLookup
} from "../src/services/evidenceEngine";
import {
	completeBlock1,
	completeBlock2,
	completeBlock3
} from "../src/services/evidenceEngine";

class TestStorage {
	values = new Map<string, unknown>();
	alarm: number | null = null;

	async get<T>(key: string): Promise<T | undefined> {
		return this.values.get(key) as T | undefined;
	}

	async put(key: string, value: unknown): Promise<void> {
		this.values.set(key, structuredClone(value));
	}

	async deleteAll(): Promise<void> {
		this.values.clear();
	}

	async setAlarm(value: number | Date): Promise<void> {
		this.alarm = value instanceof Date
			? value.getTime()
			: value;
	}

	async deleteAlarm(): Promise<void> {
		this.alarm = null;
	}
}

function request(
	path: string,
	body?: Record<string, unknown>,
	method = "POST"
): Request {
	return new Request(`https://block3.test${path}`, {
		method,
		headers: body
			? { "content-type": "application/json" }
			: undefined,
		body: body ? JSON.stringify(body) : undefined
	});
}

const call = {
	callSessionId: "session-a",
	callControlId: "control-a"
};

async function json(response: Response): Promise<any> {
	return response.json();
}

function createSession() {
	const storage = new TestStorage();
	const session = new Block3LiveSession({
		storage
	} as unknown as DurableObjectState);

	return { session, storage };
}

function liveContext() {
	return {
		block2EvidenceBox: completeBlock2({
			block1EvidenceBox: completeBlock1({
				callInformation: {
					from: "+18005551234",
					to: "+18005559876"
				},
				callRecord: call,
				billingTimer: {
					startedAt: "2026-08-13T12:00:00.000Z"
				}
			}),
			screeningInformation: {
				callingNumberInformation: {
					phoneNumber: "+18005551234"
				},
				stirShakenInformation: null,
				cnamInformation: null,
				carrierLineLookupInformation: null
			}
		}),
		callInformation: {
			callSessionId: call.callSessionId,
			callControlId: call.callControlId,
			callStartedAt: "2026-08-13T12:00:00.000Z",
			callCompletedAt: null,
			callingNumber: "+18005551234",
			cnam: null,
			carrier: null,
			lineType: null,
			stirShaken: null,
			country: null,
			state: null,
			county: null,
			city: null,
			zipCode: null,
			areaCode: null,
			geographicInformation: null,
			prompt1At: "2026-08-13T12:00:01.000Z",
			prompt2At: null,
			connectionAt: null,
			diversionAt: null
		},
		subscriber: {
			id: 1,
			name: "Test Subscriber",
			phoneNumber: "+18005559875",
			screeningNumber: "+18005559876",
			sipUsername: "test_subscriber",
			carrier: null,
			accountStatus: "active",
			coverageStatus: "active",
			country: null,
			state: null,
			county: null,
			city: null,
			zipCode: null,
			community: null
		},
		approvedDestination: {
			destinationType: "app" as const,
			destination: "test_subscriber",
			screeningNumber: "+18005559876",
			reason: "Test approved destination."
		}
	};
}

function liveDatabase(): D1Database {
	return {
		prepare: vi.fn(() => ({
			bind: vi.fn(() => ({
				run: vi.fn(async () => ({ meta: { changes: 1 } }))
			}))
		}))
	} as unknown as D1Database;
}

function productionSession() {
	const storage = new TestStorage();
	const db = liveDatabase();
	const session = new Block3LiveSession(
		{ storage } as unknown as DurableObjectState,
		{
			nomorescamcalls_db: db,
			TELNYX_LIVE_EXECUTION: "true",
			TELNYX_API_KEY: "telnyx-key",
			OPENAI_API_KEY: "openai-key",
			OPENAI_CALLER_RESPONSE_MODEL: "test-model",
			IPQS_API_KEY: "ipqs-key"
		}
	);

	return { session, storage, db };
}

function openAiResponse(
	evaluation: Record<string, unknown>
): Response {
	return Response.json({
		output: [{
			type: "message",
			content: [{
				type: "output_text",
				text: JSON.stringify(evaluation)
			}]
		}]
	});
}

describe("Block 3 live-session Durable Object", () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it("isolates a call and rejects mismatched Telnyx identifiers", async () => {
		const { session } = createSession();
		await session.fetch(request("/initialize", call));
		await session.fetch(request("/prompt-started", call));

		const rejected = await session.fetch(request(
			"/transcription",
			{
				callSessionId: "session-b",
				callControlId: "control-b",
				transcript: "Wrong caller",
				isFinal: true
			}
		));

		expect(rejected.status).toBe(409);

		const state = await json(
			await session.fetch(request("/state", undefined, "GET"))
		);
		expect(state.session.prompt1Segments).toEqual([]);
	});

	it("accumulates final Prompt 1 segments and resets the exact ten-second alarm", async () => {
		vi.useFakeTimers();
		vi.setSystemTime("2026-08-13T12:00:00.000Z");
		const { session, storage } = createSession();
		await session.fetch(request("/initialize", call));
		await session.fetch(request("/prompt-started", call));
		expect(storage.alarm).toBe(Date.now() + 10_000);

		vi.advanceTimersByTime(4_000);
		await session.fetch(request("/transcription", {
			...call,
			transcript: "Maria Lopez",
			isFinal: true
		}));
		expect(storage.alarm).toBe(Date.now() + 10_000);

		vi.advanceTimersByTime(3_000);
		const alarmBeforeInterim = storage.alarm;
		await session.fetch(request("/transcription", {
			...call,
			transcript: "calling about",
			isFinal: false
		}));
		expect(storage.alarm).toBe(alarmBeforeInterim);

		vi.advanceTimersByTime(2_000);
		await session.fetch(request("/transcription", {
			...call,
			transcript: "tomorrow's appointment",
			isFinal: true
		}));
		expect(storage.alarm).toBe(Date.now() + 10_000);

		await session.alarm();
		const state = await json(
			await session.fetch(request("/state", undefined, "GET"))
		);
		expect(state.session.stage).toBe("prompt1_closed");
		expect(state.prompt1.transcript).toBe(
			"Maria Lopez tomorrow's appointment"
		);
	});

	it("accepts a final Prompt 2 transcript that races the response-window alarm", async () => {
		const { session } = createSession();
		await session.fetch(request("/initialize", call));
		await session.fetch(request("/prompt-started", call));
		await session.alarm();
		await session.fetch(request("/prompt1-evaluation", {
			...call,
			nameAccepted: false,
			reasonAccepted: false
		}));
		await session.fetch(request("/prompt-started", call));
		await session.fetch(request("/transcription", {
			...call,
			transcript: "Maria Lopez",
			isFinal: true
		}));

		await session.alarm();
		const boundaryTranscript = await json(
			await session.fetch(request("/transcription", {
				...call,
				transcript: "calling about the inspection",
				isFinal: true
			}))
		);

		expect(boundaryTranscript.accepted).toBe(true);
		expect(boundaryTranscript.session.stage).toBe(
			"collecting_prompt2"
		);
		expect(boundaryTranscript.session.prompt2Segments).toEqual([
			"Maria Lopez",
			"calling about the inspection"
		]);
	});

	it("keeps Prompt 2 separate and opens it only after injected evaluation requires it", async () => {
		const { session } = createSession();
		const evaluator: CallerResponseEvaluator = {
			evaluate: vi.fn(async () => ({
				nameAccepted: false,
				reasonAccepted: true
			}))
		};
		const ipqsLookup: IpqsLookup = {
			lookup: vi.fn(async () => ({
				response: {},
				valid: true,
				active: true,
				recent_abuse: false,
				spammer: false
			}))
		};

		await session.fetch(request("/initialize", call));
		await session.fetch(request("/prompt-started", call));
		await session.fetch(request("/transcription", {
			...call,
			transcript: "Calling about the inspection",
			isFinal: true
		}));
		await session.alarm();
		const prematurePrompt2 = await json(
			await session.fetch(request("/prompt-started", call))
		);
		expect(prematurePrompt2.accepted).toBe(false);
		expect(prematurePrompt2.session.stage).toBe(
			"prompt1_closed"
		);

		const prompt1State = await json(
			await session.fetch(request("/state", undefined, "GET"))
		);
		const evaluation = await evaluator.evaluate(prompt1State.prompt1);
		const transition = await json(
			await session.fetch(request("/prompt1-evaluation", {
				...call,
				...evaluation
			}))
		);

		expect(transition.secondPromptRequired).toBe(true);
		expect(transition.session.stage).toBe("awaiting_prompt2");
		expect(ipqsLookup.lookup).not.toHaveBeenCalled();

		await session.fetch(request("/prompt-started", call));
		await session.fetch(request("/transcription", {
			...call,
			transcript: "Maria Lopez calling about the inspection",
			isFinal: true
		}));
		await session.alarm();

		const finalState = await json(
			await session.fetch(request("/state", undefined, "GET"))
		);
		expect(finalState.prompt1.transcript).toBe(
			"Calling about the inspection"
		);
		expect(finalState.prompt2.transcript).toBe(
			"Maria Lopez calling about the inspection"
		);
		expect(finalState.session.stage).toBe("prompt2_closed");

		const completionEvaluator: CallerResponseEvaluator = {
			evaluate: vi.fn()
				.mockResolvedValueOnce({
					nameAccepted: false,
					reasonAccepted: true
				})
				.mockResolvedValueOnce({
					nameAccepted: true,
					reasonAccepted: true
				})
		};
		const callController: Block3CallController = {
			startRecording: vi.fn(),
			connectSubscriber: vi.fn(),
			playUnavailableAndDisconnect: vi.fn(),
			playTechnicalDifficultiesAndDisconnect: vi.fn(),
			stopRecording: vi.fn()
		};
		const block2EvidenceBox = completeBlock2({
			block1EvidenceBox: completeBlock1({
				callInformation: {},
				callRecord: {},
				billingTimer: {}
			}),
			screeningInformation: {
				callingNumberInformation: {},
				stirShakenInformation: {},
				cnamInformation: {},
				carrierLineLookupInformation: {}
			}
		});

		const result = await completeBlock3({
			block2EvidenceBox,
			prompt1: finalState.prompt1,
			prompt2: finalState.prompt2,
			evaluator: completionEvaluator,
			ipqsLookup,
			callController
		});

		expect(result.prompt1.transcript).toBe(
			"Calling about the inspection"
		);
		expect(result.prompt2?.transcript).toBe(
			"Maria Lopez calling about the inspection"
		);
		expect(result.callResult).toBe("connected");
		expect(ipqsLookup.lookup).toHaveBeenCalledOnce();

		await session.fetch(request("/prompt2-evaluation", {
			...call,
			nameAccepted: true,
			reasonAccepted: true
		}));
		await session.fetch(request("/complete", call));
		const cleared = await json(
			await session.fetch(request("/state", undefined, "GET"))
		);
		expect(cleared.session).toBeNull();
	});

	it("removes temporary state after Block 3 is ready and completed", async () => {
		const { session, storage } = createSession();
		await session.fetch(request("/initialize", call));
		await session.fetch(request("/prompt-started", call));
		await session.fetch(request("/transcription", {
			...call,
			transcript: "Maria calling about an appointment",
			isFinal: true
		}));
		await session.alarm();
		await session.fetch(request("/prompt1-evaluation", {
			...call,
			nameAccepted: true,
			reasonAccepted: true
		}));

		const completed = await session.fetch(request(
			"/complete",
			call
		));
		expect(completed.status).toBe(200);
		expect(storage.alarm).toBeNull();
		expect(storage.values.size).toBe(1);

		const state = await json(
			await session.fetch(request("/state", undefined, "GET"))
		);
		expect(state.session).toBeNull();
	});

	it("acknowledges only matching late transcription after completion", async () => {
		const { session } = createSession();
		await session.fetch(request("/initialize", call));
		await session.fetch(request("/prompt-started", call));
		await session.alarm();
		await session.fetch(request("/prompt1-evaluation", {
			...call,
			nameAccepted: true,
			reasonAccepted: true
		}));
		await session.fetch(request("/complete", call));

		const late = await session.fetch(request("/transcription", {
			...call,
			transcript: "late final segment",
			isFinal: true
		}));
		expect(late.status).toBe(200);
		expect(await json(late)).toEqual({
			accepted: false,
			completed: true
		});

		const unrelated = await session.fetch(request("/transcription", {
			callSessionId: "different-session",
			callControlId: "different-control",
			transcript: "not a completed call",
			isFinal: true
		}));
		expect(unrelated.status).toBe(409);
	});

	it("evaluates a complete Prompt 1, skips IPQS and Prompt 2, hands off evidence, and clears state", async () => {
		const providerFetch = vi.fn(async (
			input: RequestInfo | URL
		) => {
			const url = String(input);

			if (url.endsWith("/responses")) {
				return openAiResponse({
					nameAccepted: true,
					reasonAccepted: true,
					extractedName: "Maria",
					extractedReason: "an appointment"
				});
			}

			return Response.json({ data: { result: "ok" } });
		});
		vi.stubGlobal("fetch", providerFetch);
		const { session, storage, db } = productionSession();

		await session.fetch(request("/initialize", {
			...call,
			...liveContext()
		}));
		await session.fetch(request("/prompt-started", call));
		await session.fetch(request("/transcription", {
			...call,
			transcript: "Maria calling about an appointment",
			isFinal: true
		}));
		await session.alarm();

		const urls = providerFetch.mock.calls.map(
			([input]) => String(input)
		);
		expect(urls.filter((url) =>
			url.endsWith("/responses")
		)).toHaveLength(1);
		expect(urls.some((url) =>
			url.includes("ipqualityscore")
		)).toBe(false);
		expect(urls.some((url) =>
			url.includes("/actions/transfer")
		)).toBe(true);
		expect(storage.values.size).toBe(1);
		expect(db.prepare).toHaveBeenCalledWith(
			expect.stringContaining(
				"INSERT INTO evidence_library_calls"
			)
		);
		vi.unstubAllGlobals();
	});

	it("runs IPQS after incomplete Prompt 1, keeps Prompt 2 separate, completes, and clears state", async () => {
		let evaluation = 0;
		const providerFetch = vi.fn(async (
			input: RequestInfo | URL
		) => {
			const url = String(input);

			if (url.endsWith("/responses")) {
				evaluation += 1;
				return openAiResponse(evaluation === 1
					? {
						nameAccepted: false,
						reasonAccepted: true,
						extractedName: null,
						extractedReason: "an appointment"
					}
					: {
						nameAccepted: true,
						reasonAccepted: true,
						extractedName: "Maria",
						extractedReason: "an appointment"
					});
			}

			if (url.includes("ipqualityscore")) {
				return Response.json({
					success: false,
					message: "provider unavailable"
				}, { status: 503 });
			}

			return Response.json({ data: { result: "ok" } });
		});
		vi.stubGlobal("fetch", providerFetch);
		const { session, storage, db } = productionSession();

		await session.fetch(request("/initialize", {
			...call,
			...liveContext()
		}));
		await session.fetch(request("/prompt-started", call));
		await session.fetch(request("/transcription", {
			...call,
			transcript: "Calling about an appointment",
			isFinal: true
		}));
		await session.alarm();

		let state = await json(await session.fetch(
			request("/state", undefined, "GET")
		));
		expect(state.session.stage).toBe("awaiting_prompt2");
		expect(state.session.ipqsResult).toMatchObject({
			valid: null,
			active: null,
			recent_abuse: null,
			spammer: null
		});

		await session.fetch(request("/prompt-started", call));
		await session.fetch(request("/transcription", {
			...call,
			transcript: "Maria calling about an appointment",
			isFinal: true
		}));
		await session.alarm();

		const urls = providerFetch.mock.calls.map(
			([input]) => String(input)
		);
		expect(urls.filter((url) =>
			url.endsWith("/responses")
		)).toHaveLength(2);
		expect(urls.filter((url) =>
			url.includes("ipqualityscore")
		)).toHaveLength(1);
		expect(urls.some((url) =>
			url.includes("/actions/speak")
		)).toBe(true);
		expect(storage.values.size).toBe(1);
		expect(db.prepare).toHaveBeenCalledWith(
			expect.stringContaining(
				"INSERT INTO evidence_library_calls"
			)
		);
		vi.unstubAllGlobals();
	});

	it("waits until 48 seconds, plays the correlated unavailable message, and hangs up only after its completion", async () => {
		vi.useFakeTimers();
		vi.setSystemTime("2026-08-13T12:00:00.000Z");
		const providerFetch = vi.fn(async (
			input: RequestInfo | URL
		) => {
			const url = String(input);

			if (url.endsWith("/responses")) {
				return openAiResponse({
					nameAccepted: false,
					reasonAccepted: false,
					extractedName: null,
					extractedReason: null
				});
			}

			if (url.includes("ipqualityscore")) {
				return Response.json({
					valid: false,
					active: false,
					recent_abuse: true,
					spammer: true
				});
			}

			return Response.json({ data: { result: "ok" } });
		});
		vi.stubGlobal("fetch", providerFetch);
		const { session, storage, db } = productionSession();

		await session.fetch(request("/initialize", {
			...call,
			...liveContext()
		}));
		await session.fetch(request("/prompt-started", call));
		await session.fetch(request("/transcription", {
			...call,
			transcript: "I will not say",
			isFinal: true
		}));
		await session.alarm();
		await session.fetch(request("/prompt-started", call));
		await session.fetch(request("/transcription", {
			...call,
			transcript: "Still no answer",
			isFinal: true
		}));
		await session.alarm();

		let state = await json(await session.fetch(
			request("/state", undefined, "GET")
		));
		expect(state.session.stage).toBe(
			"awaiting_unavailable_message"
		);
		expect(storage.alarm).toBe(
			Date.parse("2026-08-13T12:00:48.000Z")
		);
		let urls = providerFetch.mock.calls.map(
			([input]) => String(input)
		);
		expect(urls.some((url) =>
			url.includes("/actions/transfer")
		)).toBe(false);
		expect(urls.some((url) =>
			url.includes("/actions/hangup")
		)).toBe(false);

		vi.setSystemTime("2026-08-13T12:00:48.000Z");
		await session.alarm();
		state = await json(await session.fetch(
			request("/state", undefined, "GET")
		));
		expect(state.session.stage).toBe(
			"playing_unavailable_message"
		);
		expect(storage.alarm).toBe(
			Date.parse("2026-08-13T12:00:59.000Z")
		);
		const speakRequests = providerFetch.mock.calls
			.filter(([input]) =>
				String(input).includes("/actions/speak")
			)
			.map(([, init]) => JSON.parse(String(init?.body)));
		expect(speakRequests.at(-1)).toEqual({
			payload:
				"We're sorry, but the party you are trying to reach is unavailable at this time. Please try your call again later. Goodbye.",
			language: "en-US",
			voice: "female",
			client_state: UNAVAILABLE_MESSAGE_CLIENT_STATE
		});
		urls = providerFetch.mock.calls.map(
			([input]) => String(input)
		);
		expect(urls.some((url) =>
			url.includes("/actions/hangup")
		)).toBe(false);

		const ignored = await json(await session.fetch(request(
			"/unavailable-speak-ended",
			{
				...call,
				clientState: "technical-message"
			}
		)));
		expect(ignored.accepted).toBe(false);
		expect(providerFetch.mock.calls.map(
			([input]) => String(input)
		).some((url) => url.includes("/actions/hangup"))).toBe(false);

		const playingState = structuredClone(state.session);
		const completed = await json(await session.fetch(request(
			"/unavailable-speak-ended",
			{
				...call,
				clientState: UNAVAILABLE_MESSAGE_CLIENT_STATE
			}
		)));
		expect(completed).toMatchObject({
			accepted: true,
			completed: true
		});
		expect(storage.values.size).toBe(1);
		expect(storage.alarm).toBeNull();
		expect(db.prepare).toHaveBeenCalledWith(
			expect.stringContaining(
				"INSERT INTO evidence_library_calls"
			)
		);

		const guard = productionSession();
		await guard.storage.put(
			"block3-live-session",
			playingState
		);
		vi.setSystemTime("2026-08-13T12:00:59.000Z");
		await guard.session.alarm();
		expect(guard.storage.values.size).toBe(1);
		expect(guard.storage.alarm).toBeNull();
	});

	it("uses technical-difficulties call control when live OpenAI evaluation fails", async () => {
		const providerFetch = vi.fn(async (
			input: RequestInfo | URL
		) => String(input).endsWith("/responses")
			? new Response("failure", { status: 503 })
			: Response.json({ data: { result: "ok" } }));
		vi.stubGlobal("fetch", providerFetch);
		const { session } = productionSession();

		await session.fetch(request("/initialize", {
			...call,
			...liveContext()
		}));
		await session.fetch(request("/prompt-started", call));
		await session.fetch(request("/transcription", {
			...call,
			transcript: "Maria calling about an appointment",
			isFinal: true
		}));

		await expect(session.alarm()).resolves.toBeUndefined();
		const urls = providerFetch.mock.calls.map(
			([input]) => String(input)
		);
		expect(urls.some((url) =>
			url.includes("/actions/speak")
		)).toBe(true);
		expect(urls.some((url) =>
			url.includes("/actions/hangup")
		)).toBe(true);
		const state = await json(await session.fetch(
			request("/state", undefined, "GET")
		));
		expect(state.session).toBeNull();
		vi.unstubAllGlobals();
	});
});
