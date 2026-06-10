import { screenPhoneNumber } from "./services/screening";
import { recordScamSignal } from "./services/signals";
import { planTelnyxAction } from "./services/telnyxActions";
import { normalizeTelnyxEvent, shouldScreenTelnyxEvent } from "./services/telnyxEvents";
import { planTelnyxCommand } from "./services/telnyxCommands";
import { recordTelnyxWebhookEvent } from "./services/telnyxAudit";
import { planChallengePrompt } from "./services/challengePrompts";
import { hashPhoneNumber } from "./utils/hash";

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		// Health Check
		if (request.method === "GET" && url.pathname === "/") {
			return Response.json({
				service: "nomorescamcalls",
				status: "ok",
				version: "0.1.0"
			});
		}

		// Hash Test Endpoint
		if (request.method === "GET" && url.pathname === "/hash-test") {
			const phoneNumber = url.searchParams.get("phone") ?? "";

			if (!phoneNumber) {
				return Response.json({
					error: "Missing phone query parameter"
				}, {
					status: 400
				});
			}

			const callerHash = await hashPhoneNumber(phoneNumber);

			return Response.json({
				phoneNumber,
				callerHash
			});
		}

		// Signal Summary Endpoint
		if (request.method === "GET" && url.pathname === "/signals") {
			const phoneNumber = url.searchParams.get("phone") ?? "";

			if (!phoneNumber) {
				return Response.json({
					error: "Missing phone query parameter"
				}, {
					status: 400
				});
			}

			const callerHash = await hashPhoneNumber(phoneNumber);

			const signals = await env.nomorescamcalls_db
				.prepare(
					"SELECT signal_type, confidence, source, created_at FROM scam_signals WHERE caller_hash = ? ORDER BY created_at DESC"
				)
				.bind(callerHash)
				.all();

			return Response.json({
				phoneNumber,
				callerHash,
				signals: signals.results
			});
		}

		// Database Test Endpoint
		if (request.method === "GET" && url.pathname === "/db-test") {
			const result = await env.nomorescamcalls_db
				.prepare("SELECT * FROM block_list")
				.all();

			return Response.json(result);
		}

		// Simple screening endpoint
		if (request.method === "POST" && url.pathname === "/screen") {
			const body = await request.json() as {
				phoneNumber?: string;
			};

			const phoneNumber = body.phoneNumber ?? "";

			const result = await screenPhoneNumber(
				phoneNumber,
				env.nomorescamcalls_db
			);

			return Response.json(result);
		}

		// Scam Signal Endpoint
		if (request.method === "POST" && url.pathname === "/signal") {
			const body = await request.json() as {
				phoneNumber?: string;
				signalType?: string;
				confidence?: number;
				source?: string;
			};

			const phoneNumber = body.phoneNumber ?? "";
			const signalType = body.signalType ?? "";
			const confidence = body.confidence ?? 1.0;
			const source = body.source ?? "manual_test";

			if (!phoneNumber || !signalType) {
				return Response.json({
					error: "phoneNumber and signalType are required"
				}, {
					status: 400
				});
			}

			await recordScamSignal(
				env.nomorescamcalls_db,
				phoneNumber,
				signalType,
				confidence,
				source
			);

			return Response.json({
				received: true,
				phoneNumber,
				signalType,
				confidence,
				source
			});
		}

		// Telnyx webhook endpoint
		if (request.method === "POST" && url.pathname === "/webhooks/telnyx") {
			const payload = await request.json();

			console.log("TELNYX WEBHOOK:", JSON.stringify(payload));

			const telnyxEvent = normalizeTelnyxEvent(payload);
			const callerNumber = telnyxEvent.from;

			if (!shouldScreenTelnyxEvent(telnyxEvent)) {
				await recordTelnyxWebhookEvent(
					env.nomorescamcalls_db,
					telnyxEvent,
					"none",
					"noop"
				);

				return Response.json({
					received: true,
					screened: false,
					reason: "event_type_not_screened",
					telnyxEvent
				});
			}

			if (!callerNumber) {
				return Response.json({
					received: true,
					screened: false,
					reason: "missing_caller_number"
				});
			}

			const screening = await screenPhoneNumber(
				callerNumber,
				env.nomorescamcalls_db
			);

			const plannedTelnyxAction = planTelnyxAction(screening.action);
			const plannedTelnyxCommand = planTelnyxCommand(
				telnyxEvent,
				plannedTelnyxAction
			);
			const plannedChallengePrompt = planChallengePrompt(
				screening.challengeProfile
			);

			await recordTelnyxWebhookEvent(
				env.nomorescamcalls_db,
				telnyxEvent,
				plannedTelnyxAction.action,
				plannedTelnyxCommand.command
			);

			return Response.json({
				received: true,
				screened: true,
				callerNumber,
				telnyxEvent,
				screening,
				plannedTelnyxAction,
				plannedTelnyxCommand,
				plannedChallengePrompt
			});
		}

		return new Response("Not Found", {
			status: 404
		});
	}
} satisfies ExportedHandler<Env>;