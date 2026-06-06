import { screenPhoneNumber } from "./services/screening";

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

			const result = screenPhoneNumber(phoneNumber);

			return Response.json(result);
		}

		// Telnyx webhook endpoint
		if (request.method === "POST" && url.pathname === "/webhooks/telnyx") {
			const payload = await request.json();

			console.log("TELNYX WEBHOOK:", JSON.stringify(payload));

			return Response.json({
				received: true
			});
		}

		return new Response("Not Found", {
			status: 404
		});
	}
} satisfies ExportedHandler<Env>;