import { screenPhoneNumber } from "./services/screening";
import { recordScamSignal } from "./services/signals";
import { hashPhoneNumber } from "./utils/hash";
import { handleTelnyxWebhook } from "./services/telnyxWebhookHandler";
import { listRecentTelnyxWebhookEvents } from "./services/telnyxAudit";
import { verifyTelnyxWebhook } from "./services/telnyxSecurity";
import { listConfirmedScamNumbers, removeConfirmedScamNumber } from "./services/confirmedScams";
import { promoteConfirmedScamNumber } from "./services/scamPromotion";

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

		// Confirmed Scam Numbers Endpoint
		if (request.method === "GET" && url.pathname === "/confirmed-scams") {
			const limit = Number(url.searchParams.get("limit") ?? "25");
			const numbers = await listConfirmedScamNumbers(
				env.nomorescamcalls_db,
				limit
			);

			return Response.json({
				numbers
			});
		}

		// Manual Confirmed Scam Promotion Endpoint
		if (request.method === "POST" && url.pathname === "/confirmed-scams/promote") {
			const body = await request.json() as {
				phoneNumber?: string;
				reason?: string;
				evidenceLevel?: string;
				riskScore?: number;
			};

			const phoneNumber = body.phoneNumber ?? "";
			const reason = body.reason ?? "manual_admin_review";
			const evidenceLevel = body.evidenceLevel ?? "high";
			const riskScore = body.riskScore ?? 95;

			if (!phoneNumber) {
				return Response.json({
					error: "phoneNumber is required"
				}, {
					status: 400
				});
			}

			await promoteConfirmedScamNumber(
				env.nomorescamcalls_db,
				{
					phoneNumber,
					reason,
					evidenceLevel,
					riskScore
				}
			);

			return Response.json({
				promoted: true,
				phoneNumber,
				reason,
				evidenceLevel,
				riskScore
			});
		}

		// Manual Confirmed Scam Removal Endpoint
		if (request.method === "POST" && url.pathname === "/confirmed-scams/remove") {
			const body = await request.json() as {
				phoneNumber?: string;
			};

			const phoneNumber = body.phoneNumber ?? "";

			if (!phoneNumber) {
				return Response.json({
					error: "phoneNumber is required"
				}, {
					status: 400
				});
			}

			const removed = await removeConfirmedScamNumber(
				env.nomorescamcalls_db,
				phoneNumber
			);

			return Response.json({
				removed,
				phoneNumber
			});
		}

		// Telnyx Audit Endpoint
		if (request.method === "GET" && url.pathname === "/audit/telnyx") {
			const limit = Number(url.searchParams.get("limit") ?? "25");
			const events = await listRecentTelnyxWebhookEvents(
				env.nomorescamcalls_db,
				limit
			);

			return Response.json({
				events
			});
		}

		// Telnyx webhook endpoint
		if (request.method === "POST" && url.pathname === "/webhooks/telnyx") {
			const security = await verifyTelnyxWebhook(
				request,
				env.TELNYX_WEBHOOK_SIGNING_SECRET
			);

			if (security.enforced && !security.verified) {
				return Response.json({
					received: false,
					error: "telnyx_webhook_signature_verification_failed",
					security
				}, {
					status: 401
				});
			}

			const payload = await request.json();

			return handleTelnyxWebhook(
				payload,
				env.nomorescamcalls_db
			);
		}

		return new Response("Not Found", {
			status: 404
		});
	}
} satisfies ExportedHandler<Env>;