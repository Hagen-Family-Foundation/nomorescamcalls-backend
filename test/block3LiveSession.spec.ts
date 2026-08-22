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
	alarmHistory: number[] = [];

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
		this.alarmHistory.push(this.alarm);
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

function failedCallProviderFetch(
	onEvaluation?: (evaluationNumber: number) => void
) {
	let evaluationNumber = 0;

	return vi.fn(async (
		input: RequestInfo | URL
	) => {
		const url = String(input);

		if (url.endsWith("/responses")) {
			evaluationNumber += 1;
			onEvaluation?.(evaluationNumber);
			return openAiResponse({
				nameAccepted: false,
				reasonAccepted: false,
				extractedName: null,
				extractedReason: null
			});
		}

		return Response.json({ data: { result: "ok" } });
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

	it("closes Prompt 1 after five seconds of silence and resets that interval for each accepted final segment", async () => {
		vi.useFakeTimers();
		vi.setSystemTime("2026-08-13T12:00:00.000Z");
		const { session, storage } = createSession();
		await session.fetch(request("/initialize", call));
		await session.fetch(request("/prompt-started", call));
		expect(storage.alarm).toBe(Date.now() + 5_000);

		vi.advanceTimersByTime(4_000);
		await session.fetch(request("/transcription", {
			...call,
			transcript: "Maria Lopez",
			isFinal: true
		}));
		expect(storage.alarm).toBe(Date.now() + 5_000);

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
		expect(storage.alarm).toBe(Date.now() + 5_000);

		vi.advanceTimersByTime(4_999);
		let state = await json(
			await session.fetch(request("/state", undefined, "GET"))
		);
		expect(state.session.stage).toBe("collecting_prompt1");

		vi.advanceTimersByTime(1);
		await session.alarm();
		state = await json(
			await session.fetch(request("/state", undefined, "GET"))
		);
		expect(state.session.stage).toBe("prompt1_closed");
		expect(state.prompt1.transcript).toBe(
			"Maria Lopez tomorrow's appointment"
		);
	});

	it("accepts a final Prompt 2 transcript that races the response-window alarm", async () => {
		vi.useFakeTimers();
		vi.setSystemTime("2026-08-13T12:00:00.000Z");
		const { session, storage } = createSession();
		await session.fetch(request("/initialize", call));
		await session.fetch(request("/prompt-started", call));
		expect(storage.alarm).toBe(Date.now() + 5_000);
		await session.alarm();
		await session.fetch(request("/prompt1-evaluation", {
			...call,
			nameAccepted: false,
			reasonAccepted: false
		}));
		await session.fetch(request("/prompt-started", call));
		expect(storage.alarm).toBe(Date.now() + 5_000);
		await session.fetch(request("/transcription", {
			...call,
			transcript: "Maria Lopez",
			isFinal: true
		}));
		expect(storage.alarm).toBe(Date.now() + 5_000);

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
		expect(storage.alarm).toBe(Date.now() + 5_000);
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
		expect(ipqsLookup.lookup).not.toHaveBeenCalled();

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

	it("waits until Prompt 2 scoring before requesting eligible IPQS evidence", async () => {
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
						nameAccepted: false,
						reasonAccepted: true,
						extractedName: null,
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
		expect(state.session.ipqsResult).toBeNull();
		expect(providerFetch.mock.calls.map(
			([input]) => String(input)
		).filter((url) =>
			url.includes("ipqualityscore")
		)).toHaveLength(0);

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
		const providerFetch = failedCallProviderFetch();
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
		const alarmCountBeforePlayback =
			storage.alarmHistory.length;
		await session.alarm();
		state = await json(await session.fetch(
			request("/state", undefined, "GET")
		));
		expect(state.session.stage).toBe(
			"playing_unavailable_message"
		);
		expect(storage.alarm).toBe(
			Date.parse("2026-08-13T12:01:08.000Z")
		);
		expect(storage.alarmHistory.slice(
			alarmCountBeforePlayback
		)).toEqual([
			Date.parse("2026-08-13T12:01:08.000Z")
		]);
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
		vi.setSystemTime("2026-08-13T12:00:59.000Z");
		state = await json(await session.fetch(
			request("/state", undefined, "GET")
		));
		expect(state.session.stage).toBe(
			"playing_unavailable_message"
		);
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
		const lateCompletion = await json(await session.fetch(request(
			"/unavailable-speak-ended",
			{
				...call,
				clientState: UNAVAILABLE_MESSAGE_CLIENT_STATE
			}
		)));
		expect(lateCompletion).toEqual({
			accepted: false,
			completed: true
		});
		await expect(session.alarm()).resolves.toBeUndefined();

		const fallback = productionSession();
		await fallback.storage.put(
			"block3-live-session",
			playingState
		);
		providerFetch.mockClear();
		vi.setSystemTime("2026-08-13T12:01:08.000Z");
		await fallback.session.alarm();
		const completionAfterFallback = await json(
			await fallback.session.fetch(request(
				"/unavailable-speak-ended",
				{
					...call,
					clientState:
						UNAVAILABLE_MESSAGE_CLIENT_STATE
				}
			))
		);
		expect(completionAfterFallback).toEqual({
			accepted: false,
			completed: true
		});
		await expect(fallback.session.alarm()).resolves.toBeUndefined();
		expect(fallback.storage.values.size).toBe(1);
		expect(fallback.storage.alarm).toBeNull();
		const fallbackUrls = providerFetch.mock.calls.map(
			([input]) => String(input)
		);
		expect(fallbackUrls.filter((url) =>
			url.includes("/actions/hangup")
		)).toHaveLength(1);
		expect(fallbackUrls.filter((url) =>
			url.includes("/actions/record_stop")
		)).toHaveLength(1);
		expect(fallback.db.prepare).toHaveBeenCalledOnce();
	});

	it("starts failed-call playback immediately after the 48-second target and arms one 20-second completion fallback", async () => {
		vi.useFakeTimers();
		vi.setSystemTime("2026-08-13T12:00:00.000Z");
		const providerFetch = failedCallProviderFetch(
			(evaluationNumber) => {
				if (evaluationNumber === 2) {
					vi.setSystemTime(
						"2026-08-13T12:00:50.000Z"
					);
				}
			}
		);
		vi.stubGlobal("fetch", providerFetch);
		const { session, storage } = productionSession();

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
		vi.advanceTimersByTime(5_000);
		await session.alarm();
		await session.fetch(request("/prompt-started", call));
		await session.fetch(request("/transcription", {
			...call,
			transcript: "Still no answer",
			isFinal: true
		}));
		vi.advanceTimersByTime(5_000);
		await session.alarm();

		expect(storage.alarm).toBe(
			Date.parse("2026-08-13T12:00:50.000Z")
		);
		const alarmCountBeforePlayback =
			storage.alarmHistory.length;
		await session.alarm();
		expect(storage.alarm).toBe(
			Date.parse("2026-08-13T12:01:10.000Z")
		);
		expect(storage.alarmHistory.slice(
			alarmCountBeforePlayback
		)).toEqual([
			Date.parse("2026-08-13T12:01:10.000Z")
		]);
		const unavailableSpeak = providerFetch.mock.calls
			.map(([, init]) => init?.body
				? JSON.parse(String(init.body))
				: null)
			.find((body) => body?.client_state ===
				UNAVAILABLE_MESSAGE_CLIENT_STATE);
		expect(unavailableSpeak).toBeDefined();
	});

	it("starts the single completion fallback only after Telnyx accepts unavailable playback", async () => {
		vi.useFakeTimers();
		vi.setSystemTime("2026-08-13T12:00:00.000Z");
		let acceptUnavailableSpeak!: (response: Response) => void;
		const unavailableSpeakAcceptance = new Promise<Response>(
			(resolve) => {
				acceptUnavailableSpeak = resolve;
			}
		);
		let markUnavailableSpeakStarted!: () => void;
		const unavailableSpeakStarted = new Promise<void>(
			(resolve) => {
				markUnavailableSpeakStarted = resolve;
			}
		);
		const providerFetch = vi.fn(async (
			input: RequestInfo | URL,
			init?: RequestInit
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

			const body = init?.body
				? JSON.parse(String(init.body))
				: null;

			if (
				url.includes("/actions/speak")
				&& body?.client_state ===
					UNAVAILABLE_MESSAGE_CLIENT_STATE
			) {
				markUnavailableSpeakStarted();
				return unavailableSpeakAcceptance;
			}

			return Response.json({ data: { result: "ok" } });
		});
		vi.stubGlobal("fetch", providerFetch);
		const { session, storage } = productionSession();

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

		vi.setSystemTime("2026-08-13T12:00:48.000Z");
		const alarmCountBeforePlayback =
			storage.alarmHistory.length;
		const playback = session.alarm();
		await unavailableSpeakStarted;
		expect(storage.alarmHistory.slice(
			alarmCountBeforePlayback
		)).toEqual([]);

		vi.setSystemTime("2026-08-13T12:00:49.000Z");
		acceptUnavailableSpeak(
			Response.json({ data: { result: "ok" } })
		);
		await playback;
		expect(storage.alarmHistory.slice(
			alarmCountBeforePlayback
		)).toEqual([
			Date.parse("2026-08-13T12:01:09.000Z")
		]);
	});

	it("plays the unavailable message after second 59 and finalizes normally on correlated completion", async () => {
		vi.useFakeTimers();
		vi.setSystemTime("2026-08-13T12:00:00.000Z");
		const providerFetch = failedCallProviderFetch(
			(evaluationNumber) => {
				if (evaluationNumber === 2) {
					vi.setSystemTime(
						"2026-08-13T12:01:01.000Z"
					);
				}
			}
		);
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
		const alarmCountBeforePlayback =
			storage.alarmHistory.length;
		await session.alarm();
		let state = await json(await session.fetch(
			request("/state", undefined, "GET")
		));
		expect(state.session.stage).toBe(
			"playing_unavailable_message"
		);
		expect(storage.alarm).toBe(
			Date.parse("2026-08-13T12:01:21.000Z")
		);
		expect(storage.alarmHistory.slice(
			alarmCountBeforePlayback
		)).toEqual([
			Date.parse("2026-08-13T12:01:21.000Z")
		]);
		const unavailableSpeak = providerFetch.mock.calls
			.map(([, init]) => init?.body
				? JSON.parse(String(init.body))
				: null)
			.find((body) => body?.client_state ===
				UNAVAILABLE_MESSAGE_CLIENT_STATE);
		expect(unavailableSpeak).toBeDefined();
		expect(providerFetch.mock.calls.map(
			([input]) => String(input)
		).some((url) => url.includes("/actions/hangup"))).toBe(false);

		const completed = await json(await session.fetch(request(
			"/unavailable-speak-ended",
			{
				...call,
				clientState: UNAVAILABLE_MESSAGE_CLIENT_STATE
			}
		)));
		expect(completed).toEqual({
			accepted: true,
			completed: true
		});
		await expect(session.alarm()).resolves.toBeUndefined();
		state = await json(await session.fetch(
			request("/state", undefined, "GET")
		));
		expect(state.session).toBeNull();
		expect(storage.values.size).toBe(1);
		expect(storage.alarm).toBeNull();
		const urls = providerFetch.mock.calls.map(
			([input]) => String(input)
		);
		expect(urls.filter((url) =>
			url.includes("/actions/hangup")
		)).toHaveLength(1);
		expect(urls.filter((url) =>
			url.includes("/actions/record_stop")
		)).toHaveLength(1);
		expect(db.prepare).toHaveBeenCalledOnce();
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
