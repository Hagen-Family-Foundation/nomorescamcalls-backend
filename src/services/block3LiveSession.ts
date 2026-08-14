import type {
	Block3EvidenceBox,
	Block3PromptEvidence,
	IpqsLookupResult
} from "./evidenceEngine/block3";
import type {
	Block2EvidenceBox
} from "./evidenceEngine/block2";
import type {
	CallerResponseEvaluation
} from "./evidenceEngine/responseExtraction";
import {
	evaluateCallerResponse
} from "./evidenceEngine/responseExtraction";
import type {
	EvidenceLibraryCallInformation,
	EvidenceLibrarySubscriber
} from "./evidenceLibrary";
import type {
	ApprovedCallDestination
} from "./routing";
import {
	createOpenAICallerResponseEvaluator
} from "./openaiCallerResponseEvaluator";
import {
	createIpqsLookup
} from "./ipqsLookup";
import {
	createTelnyxBlock3CallController
} from "./telnyxBlock3CallController";
import {
	getTelnyxExecutionPolicy
} from "./telnyxExecutionPolicy";
import {
	buildTelnyxRequest
} from "./telnyxRequests";
import {
	executeTelnyxRequest
} from "./telnyxExecutor";
import type {
	TelnyxPlannedCommand
} from "./telnyxCommands";
import {
	deliverCompletedEvidenceEngineCall
} from "./evidenceEngine/callFlow";
import {
	completeBlock3,
	isIpqsEligibleAfterFirstResponse
} from "./evidenceEngine/block3";

const CALLER_SILENCE_MILLISECONDS = 10_000;
const UNAVAILABLE_MESSAGE_START_MILLISECONDS = 48_000;
const ABSOLUTE_TERMINATION_MILLISECONDS = 59_000;
const SESSION_STORAGE_KEY = "block3-live-session";
const COMPLETED_STORAGE_KEY = "block3-live-session-completed";
export const UNAVAILABLE_MESSAGE_CLIENT_STATE =
	"YmxvY2szX3VuYXZhaWxhYmxlX21lc3NhZ2U=";
const UNAVAILABLE_MESSAGE =
	"We're sorry, but the party you are trying to reach is unavailable at this time. Please try your call again later. Goodbye.";

export type Block3LiveSessionStage =
	| "awaiting_prompt1"
	| "collecting_prompt1"
	| "prompt1_closed"
	| "awaiting_prompt2"
	| "collecting_prompt2"
	| "prompt2_closed"
	| "ready_to_complete"
	| "awaiting_unavailable_message"
	| "playing_unavailable_message";

export interface Block3LiveSessionState {
	callSessionId: string;
	callControlId: string;
	stage: Block3LiveSessionStage;
	prompt1Segments: string[];
	prompt2Segments: string[];
	secondPromptIssued: boolean;
	lastRecognizedSpeechAt: string | null;
	block2EvidenceBox: Block2EvidenceBox;
	callInformation: EvidenceLibraryCallInformation;
	subscriber: EvidenceLibrarySubscriber;
	approvedDestination: ApprovedCallDestination;
	prompt1Evaluation: CallerResponseEvaluation | null;
	prompt2Evaluation: CallerResponseEvaluation | null;
	ipqsResult: IpqsLookupResult | null;
	pendingBlock3EvidenceBox: Block3EvidenceBox | null;
}

interface UnavailableSpeakEndedRequest
	extends InitializeRequest {
	clientState: string | null;
}

interface InitializeRequest {
	callSessionId: string;
	callControlId: string;
	block2EvidenceBox: Block2EvidenceBox;
	callInformation: EvidenceLibraryCallInformation;
	subscriber: EvidenceLibrarySubscriber;
	approvedDestination: ApprovedCallDestination;
}

interface CompletedSession {
	callSessionId: string;
	callControlId: string;
}

interface TranscriptionRequest
	extends InitializeRequest {
	transcript: string;
	isFinal: boolean;
}

interface PromptEvaluationRequest
	extends InitializeRequest {
	nameAccepted: boolean;
	reasonAccepted: boolean;
}

interface Block3LiveSessionEnv {
	nomorescamcalls_db: D1Database;
	TELNYX_LIVE_EXECUTION?: string;
	TELNYX_API_KEY?: string;
	TELNYX_API_BASE_URL?: string;
	OPENAI_API_KEY?: string;
	OPENAI_CALLER_RESPONSE_MODEL?: string;
	OPENAI_API_BASE_URL?: string;
	IPQS_API_KEY?: string;
	IPQS_API_BASE_URL?: string;
}

const SECOND_REQUEST =
	"Please speak slowly and clearly. State your name and reason for calling.";

function promptEvidence(
	segments: string[]
): Block3PromptEvidence {
	return {
		audioRecordingReference: null,
		transcript: segments.join(" "),
		language: null
	};
}

export class Block3LiveSession {
	constructor(
		private readonly state:
			DurableObjectState,
		private readonly env?:
			Block3LiveSessionEnv
	) {}

	private async read():
		Promise<Block3LiveSessionState | null> {
		return await this.state.storage.get<Block3LiveSessionState>(
			SESSION_STORAGE_KEY
		) ?? null;
	}

	private async write(
		session: Block3LiveSessionState
	): Promise<void> {
		await this.state.storage.put(
			SESSION_STORAGE_KEY,
			session
		);
	}

	private async readCompleted():
		Promise<CompletedSession | null> {
		return await this.state.storage.get<CompletedSession>(
			COMPLETED_STORAGE_KEY
		) ?? null;
	}

	private async markCompleted(
		session: Block3LiveSessionState
	): Promise<void> {
		await this.state.storage.deleteAll();
		await this.state.storage.put(
			COMPLETED_STORAGE_KEY,
			{
				callSessionId: session.callSessionId,
				callControlId: session.callControlId
			} satisfies CompletedSession
		);
	}

	private async requireSession():
		Promise<Block3LiveSessionState> {
		const session = await this.read();

		if (!session) {
			throw new Error(
				"Block 3 live session has not been initialized."
			);
		}

		return session;
	}

	private verifyCall(
		session: Block3LiveSessionState,
		request: InitializeRequest
	): void {
		if (
			request.callSessionId !== session.callSessionId
			|| request.callControlId !== session.callControlId
		) {
			throw new Error(
				"Telnyx call identifiers do not match the Block 3 live session."
			);
		}
	}

	private async resetSilenceAlarm():
		Promise<void> {
		await this.state.storage.setAlarm(
			Date.now() +
				CALLER_SILENCE_MILLISECONDS
		);
	}

	private callController(
		session: Block3LiveSessionState
	) {
		if (!this.env) {
			throw new Error(
				"Block 3 live-session environment is unavailable."
			);
		}

		return createTelnyxBlock3CallController({
			callControlId: session.callControlId,
			callSessionId: session.callSessionId,
			approvedDestination:
				session.approvedDestination,
			executionPolicy:
				getTelnyxExecutionPolicy(this.env),
			telnyxApiConfig: {
				apiKey: this.env.TELNYX_API_KEY,
				baseUrl: this.env.TELNYX_API_BASE_URL
			}
		});
	}

	private async issueSecondRequest(
		session: Block3LiveSessionState
	): Promise<void> {
		if (!this.env) {
			return;
		}

		const command: TelnyxPlannedCommand = {
			mode: "simulated",
			command: "speak",
			callControlId: session.callControlId,
			callSessionId: session.callSessionId,
			reason:
				"Block 3 plays the approved second caller request.",
			safetyNote:
				"Caller request playback is guarded by TELNYX_LIVE_EXECUTION."
		};
		const request = buildTelnyxRequest(
			command,
			{
				prompt: SECOND_REQUEST,
				timeoutSeconds: 10
			},
			session.approvedDestination
		);
		const result = await executeTelnyxRequest(
			request,
			getTelnyxExecutionPolicy(this.env),
			{
				apiKey: this.env.TELNYX_API_KEY,
				baseUrl: this.env.TELNYX_API_BASE_URL
			}
		);

		if (result.mode !== "live" || !result.executed) {
			throw new Error(
				`Block 3 second request failed: ${result.reason}`
			);
		}
	}

	private plannedCommand(
		session: Block3LiveSessionState,
		command: TelnyxPlannedCommand["command"],
		reason: string
	): TelnyxPlannedCommand {
		return {
			mode: "simulated",
			command,
			callControlId: session.callControlId,
			callSessionId: session.callSessionId,
			reason,
			safetyNote:
				"Execution is controlled by the approved Telnyx live-execution policy."
		};
	}

	private async executeCommand(
		session: Block3LiveSessionState,
		command: TelnyxPlannedCommand,
		speech: {
			prompt: string;
			timeoutSeconds: number;
			clientState?: string;
		} | null = null
	): Promise<void> {
		if (!this.env) {
			throw new Error(
				"Block 3 live-session environment is unavailable."
			);
		}

		const result = await executeTelnyxRequest(
			buildTelnyxRequest(
				command,
				speech,
				session.approvedDestination
			),
			getTelnyxExecutionPolicy(this.env),
			{
				apiKey: this.env.TELNYX_API_KEY,
				baseUrl: this.env.TELNYX_API_BASE_URL
			}
		);

		if (result.mode !== "live" || !result.executed) {
			throw new Error(
				`${command.command} failed: ${result.reason}`
			);
		}
	}

	private callStartMilliseconds(
		session: Block3LiveSessionState
	): number {
		const startedAt = Date.parse(
			session.callInformation.callStartedAt
		);

		if (!Number.isFinite(startedAt)) {
			throw new Error(
				"Block 3 live session is missing a valid call start time."
			);
		}

		return startedAt;
	}

	private async scheduleUnavailableMessage(
		session: Block3LiveSessionState
	): Promise<void> {
		session.stage = "awaiting_unavailable_message";
		await this.write(session);
		await this.state.storage.setAlarm(Math.max(
			Date.now(),
			this.callStartMilliseconds(session) +
				UNAVAILABLE_MESSAGE_START_MILLISECONDS
		));
	}

	private async issueUnavailableMessage(
		session: Block3LiveSessionState
	): Promise<void> {
		session.stage = "playing_unavailable_message";
		session.callInformation.diversionAt =
			new Date().toISOString();
		await this.write(session);

		await this.executeCommand(
			session,
			this.plannedCommand(
				session,
				"speak",
				"Block 3 plays the unavailable message."
			),
			{
				prompt: UNAVAILABLE_MESSAGE,
				timeoutSeconds: 10,
				clientState:
					UNAVAILABLE_MESSAGE_CLIENT_STATE
			}
		);

		await this.state.storage.setAlarm(
			this.callStartMilliseconds(session) +
				ABSOLUTE_TERMINATION_MILLISECONDS
		);
	}

	private async finalizeFailedCall(
		session: Block3LiveSessionState
	): Promise<void> {
		if (!this.env || !session.pendingBlock3EvidenceBox) {
			throw new Error(
				"Block 3 failed-call evidence is unavailable."
			);
		}

		await this.executeCommand(
			session,
			this.plannedCommand(
				session,
				"hangup",
				"Block 3 disconnects the diverted call after unavailable-message playback."
			)
		);
		await this.callController(session).stopRecording();

		const callInformation = {
			...session.callInformation,
			callCompletedAt: new Date().toISOString()
		};
		await deliverCompletedEvidenceEngineCall({
			db: this.env.nomorescamcalls_db,
			block3EvidenceBox:
				session.pendingBlock3EvidenceBox,
			callInformation,
			subscriber: session.subscriber
		});

		await this.state.storage.deleteAlarm();
		await this.markCompleted(session);
	}

	private async completeLiveCall(
		session: Block3LiveSessionState
	): Promise<void> {
		if (!this.env || !session.prompt1Evaluation) {
			return;
		}

		const evaluations = [
			session.prompt1Evaluation,
			...(session.prompt2Evaluation
				? [session.prompt2Evaluation]
				: [])
		];
		let evaluationIndex = 0;
		const callController =
			this.callController(session);

		let diversionDeferred = false;
		const block3EvidenceBox = await completeBlock3({
				block2EvidenceBox:
					session.block2EvidenceBox,
				prompt1: promptEvidence(
					session.prompt1Segments
				),
				...(session.prompt2Evaluation
					? {
						prompt2: promptEvidence(
							session.prompt2Segments
						)
					}
					: {}),
				evaluator: {
					async evaluate() {
						const evaluation =
							evaluations[evaluationIndex++];

						if (!evaluation) {
							throw new Error(
								"Block 3 live evaluation evidence is missing."
							);
						}

						return evaluation;
					}
				},
				...(session.ipqsResult
					? {
						ipqsLookup: {
							async lookup() {
								return session.ipqsResult!;
							}
						}
					}
					: {}),
				callController: {
					...callController,
					async startRecording() {},
					async playUnavailableAndDisconnect() {
						diversionDeferred = true;
					},
					async stopRecording() {
						if (!diversionDeferred) {
							await callController.stopRecording();
						}
					}
				}
			});

		if (block3EvidenceBox.callResult === "diverted") {
			session.pendingBlock3EvidenceBox =
				block3EvidenceBox;
			await this.scheduleUnavailableMessage(session);
			return;
		}

		await deliverCompletedEvidenceEngineCall({
			db: this.env.nomorescamcalls_db,
			block3EvidenceBox,
			callInformation: {
				...session.callInformation,
				callCompletedAt:
					new Date().toISOString()
			},
			subscriber: session.subscriber
		});

		await this.state.storage.deleteAlarm();
		await this.markCompleted(session);
	}

	private async processClosedPrompt(
		session: Block3LiveSessionState
	): Promise<void> {
		if (!this.env) {
			return;
		}

		const evaluator =
			createOpenAICallerResponseEvaluator({
				apiKey: this.env.OPENAI_API_KEY ?? "",
				model:
					this.env.OPENAI_CALLER_RESPONSE_MODEL ?? "",
				baseUrl: this.env.OPENAI_API_BASE_URL
			});
		const prompt1 = promptEvidence(
			session.prompt1Segments
		);

		if (session.stage === "prompt1_closed") {
			const evaluation =
				await evaluateCallerResponse(
					prompt1.transcript,
					prompt1.language,
					evaluator
				);
			let current = await this.read();

			if (
				!current
				|| current.stage !== "prompt1_closed"
				|| current.prompt1Segments.join(" ") !==
					prompt1.transcript
			) {
				return;
			}

			current.prompt1Evaluation = evaluation;
			const incomplete =
				!evaluation.nameAccepted
				|| !evaluation.reasonAccepted;

			if (!incomplete) {
				current.stage = "ready_to_complete";
				await this.write(current);
				await this.completeLiveCall(current);
				return;
			}

			const ipqsResult =
				isIpqsEligibleAfterFirstResponse(
					current.block2EvidenceBox,
					evaluation
				)
					? await createIpqsLookup({
						apiKey: this.env.IPQS_API_KEY,
						baseUrl: this.env.IPQS_API_BASE_URL
					}).lookup(current.block2EvidenceBox)
					: null;
			current = await this.read();

			if (
				!current
				|| current.stage !== "prompt1_closed"
				|| current.prompt1Segments.join(" ") !==
					prompt1.transcript
			) {
				return;
			}

			current.prompt1Evaluation = evaluation;
			current.ipqsResult = ipqsResult;
			current.stage = "awaiting_prompt2";
			current.callInformation.prompt2At =
				new Date().toISOString();
			await this.write(current);
			await this.issueSecondRequest(current);
			return;
		}

		if (session.stage === "prompt2_closed") {
			const prompt2 = promptEvidence(
				session.prompt2Segments
			);
			const evaluation =
				await evaluateCallerResponse(
					prompt2.transcript,
					prompt2.language,
					evaluator
				);
			const current = await this.read();

			if (
				!current
				|| current.stage !== "prompt2_closed"
				|| current.prompt2Segments.join(" ") !==
					prompt2.transcript
			) {
				return;
			}

			current.prompt2Evaluation = evaluation;
			current.stage = "ready_to_complete";
			await this.write(current);
			await this.completeLiveCall(current);
		}
	}

	async fetch(request: Request): Promise<Response> {
		const path = new URL(request.url).pathname;

		try {
			if (
				request.method === "POST"
				&& path === "/initialize"
			) {
				const input =
					await request.json<InitializeRequest>();
				const existing = await this.read();

				if (existing) {
					this.verifyCall(existing, input);
					return Response.json(existing);
				}

				const session: Block3LiveSessionState = {
					callSessionId: input.callSessionId,
					callControlId: input.callControlId,
					stage: "awaiting_prompt1",
					prompt1Segments: [],
					prompt2Segments: [],
					secondPromptIssued: false,
					lastRecognizedSpeechAt: null,
					block2EvidenceBox:
						input.block2EvidenceBox,
					callInformation:
						input.callInformation,
					subscriber: input.subscriber,
					approvedDestination:
						input.approvedDestination,
					prompt1Evaluation: null,
					prompt2Evaluation: null,
					ipqsResult: null,
					pendingBlock3EvidenceBox: null
				};

				await this.write(session);
				return Response.json(session);
			}

			if (
				request.method === "POST"
				&& path === "/prompt-started"
			) {
				const input =
					await request.json<InitializeRequest>();
				const session = await this.requireSession();
				this.verifyCall(session, input);

				if (session.stage === "awaiting_prompt1") {
					session.stage = "collecting_prompt1";
				} else if (session.stage === "awaiting_prompt2") {
					session.stage = "collecting_prompt2";
					session.secondPromptIssued = true;
				} else {
					return Response.json({
						accepted: false,
						session
					});
				}

				await this.write(session);
				await this.resetSilenceAlarm();
				return Response.json({
					accepted: true,
					session
				});
			}

			if (
				request.method === "POST"
				&& path === "/transcription"
			) {
				const input =
					await request.json<TranscriptionRequest>();
				const session = await this.read();

				if (!session) {
					const completed = await this.readCompleted();

					if (
						completed
						&& completed.callSessionId === input.callSessionId
						&& completed.callControlId === input.callControlId
					) {
						return Response.json({
							accepted: false,
							completed: true
						});
					}

					throw new Error(
						"Block 3 live session has not been initialized."
					);
				}
				this.verifyCall(session, input);

				if (!input.isFinal || input.transcript.trim() === "") {
					return Response.json({
						accepted: false,
						session
					});
				}

				if (
					session.stage === "collecting_prompt1"
					|| session.stage === "prompt1_closed"
				) {
					session.stage = "collecting_prompt1";
					session.prompt1Segments.push(
						input.transcript.trim()
					);
				} else if (
					session.stage === "collecting_prompt2"
					|| session.stage === "prompt2_closed"
				) {
					session.stage = "collecting_prompt2";
					session.prompt2Segments.push(
						input.transcript.trim()
					);
				} else {
					return Response.json({
						accepted: false,
						session
					});
				}

				session.lastRecognizedSpeechAt =
					new Date().toISOString();
				await this.write(session);
				await this.resetSilenceAlarm();

				return Response.json({
					accepted: true,
					session
				});
			}

			if (
				request.method === "POST"
				&& path === "/prompt1-evaluation"
			) {
				const evaluation =
					await request.json<PromptEvaluationRequest>();
				const session = await this.requireSession();
				this.verifyCall(session, evaluation);

				if (session.stage !== "prompt1_closed") {
					throw new Error(
						"Prompt 1 must be closed before evaluation is applied."
					);
				}

				const secondPromptRequired =
					!evaluation.nameAccepted
					|| !evaluation.reasonAccepted;
				session.stage = secondPromptRequired
					? "awaiting_prompt2"
					: "ready_to_complete";
				await this.write(session);

				return Response.json({
					secondPromptRequired,
					prompt1: promptEvidence(
						session.prompt1Segments
					),
					session
				});
			}

			if (
				request.method === "POST"
				&& path === "/prompt2-evaluation"
			) {
				const evaluation =
					await request.json<PromptEvaluationRequest>();
				const session = await this.requireSession();
				this.verifyCall(session, evaluation);

				if (session.stage !== "prompt2_closed") {
					throw new Error(
						"Prompt 2 must be closed before evaluation is applied."
					);
				}

				session.stage = "ready_to_complete";
				await this.write(session);

				return Response.json({
					prompt2: promptEvidence(
						session.prompt2Segments
					),
					evaluation,
					session
				});
			}

			if (request.method === "GET" && path === "/state") {
				const session = await this.read();
				return Response.json({
					session,
					prompt1: session
						? promptEvidence(session.prompt1Segments)
						: null,
					prompt2: session
						? promptEvidence(session.prompt2Segments)
						: null
				});
			}

			if (
				request.method === "POST"
				&& path === "/unavailable-speak-ended"
			) {
				const input =
					await request.json<UnavailableSpeakEndedRequest>();
				const session = await this.requireSession();
				this.verifyCall(session, input);

				if (
					session.stage !== "playing_unavailable_message"
					|| input.clientState !==
						UNAVAILABLE_MESSAGE_CLIENT_STATE
				) {
					return Response.json({
						accepted: false,
						session
					});
				}

				await this.finalizeFailedCall(session);
				return Response.json({
					accepted: true,
					completed: true
				});
			}

			if (
				request.method === "POST"
				&& path === "/complete"
			) {
				const input =
					await request.json<InitializeRequest>();
				const session = await this.requireSession();
				this.verifyCall(session, input);

				if (session.stage !== "ready_to_complete") {
					throw new Error(
						"Block 3 live session is not ready to complete."
					);
				}

				await this.state.storage.deleteAlarm();
				await this.markCompleted(session);
				return Response.json({ completed: true });
			}

			return new Response("Not Found", { status: 404 });
		} catch (error) {
			return Response.json({
				error:
					error instanceof Error
						? error.message
						: "Unknown Block 3 live-session error."
			}, { status: 409 });
		}
	}

	async alarm(): Promise<void> {
		const session = await this.requireSession();

		if (session.stage === "awaiting_unavailable_message") {
			try {
				await this.issueUnavailableMessage(session);
			} catch (error) {
				console.error(
					"Block 3 unavailable-message playback failed:",
					error
				);
				await this.finalizeFailedCall(session);
			}
			return;
		}

		if (session.stage === "playing_unavailable_message") {
			await this.finalizeFailedCall(session);
			return;
		}

		if (session.stage === "collecting_prompt1") {
			session.stage = "prompt1_closed";
		} else if (session.stage === "collecting_prompt2") {
			session.stage = "prompt2_closed";
		} else {
			return;
		}

		await this.write(session);

		try {
			await this.processClosedPrompt(session);
		} catch (error) {
			console.error(
				"Block 3 live-session processing failed:",
				error
			);

			if (this.env) {
				const controller =
					this.callController(session);

				try {
					await controller
						.playTechnicalDifficultiesAndDisconnect();
				} finally {
					try {
						await controller.stopRecording();
					} finally {
						await this.state.storage.deleteAlarm();
						await this.state.storage.deleteAll();
					}
				}
			}
		}
	}
}
