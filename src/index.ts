import { screenPhoneNumber } from "./services/screening";
import { recordScamSignal } from "./services/signals";
import { hashPhoneNumber } from "./utils/hash";
import { handleTelnyxWebhook } from "./services/telnyxWebhookHandler";
import { listRecentTelnyxWebhookEvents } from "./services/telnyxAudit";
import { verifyTelnyxWebhook } from "./services/telnyxSecurity";
import { listConfirmedScamNumbers, removeConfirmedScamNumber } from "./services/confirmedScams";
import { promoteConfirmedScamNumber } from "./services/scamPromotion";
import { getCallerIntelligence } from "./services/callerLookup";
import { addCallerListEntry, listCallerListEntries, removeCallerListEntry } from "./services/callerLists";
import { createUser, listUsers } from "./services/users";
import { getScreeningNumberInventoryHealth } from "./services/screeningNumberInventory";
import { getSipCredentialInventoryHealth } from "./services/sipCredentialInventory";
import { getTelnyxExecutionPolicy } from "./services/telnyxExecutionPolicy";
import { provisionSubscriber } from "./services/provisioning";
import { syncTelnyxInventory } from "./services/telnyxInventorySync";
import { syncTelnyxSipCredentials } from "./services/telnyxSipCredentialSync";
import { fetchTelnyxVoiceApplication } from "./services/telnyxVoiceApplicationsClient";
import { fetchTelnyxRecordings } from "./services/telnyxRecordingsClient";
import { validateBetaInviteCode } from "./services/betaInviteCodes";
import { registerBetaParticipant } from "./services/betaRegistration";
import { loginBetaParticipant } from "./services/betaLogin";
import { authenticateBetaSession } from "./services/betaSession";
import { logoutBetaParticipant } from "./services/betaLogout";
import {
	acceptCurrentBetaAgreement,
	getCurrentBetaAgreement,
	hasAcceptedCurrentBetaAgreement
} from "./services/betaAgreement";
import {
	addSearchToRecipeCatalog,
	listRecipeCatalog,
	listSearchHistory,
	runRecipe,
	searchEvidenceLibrary
} from "./services/knowledgeEngine";

export {
	Block3LiveSession
} from "./services/block3LiveSession";


const PORTAL_CORS_HEADERS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Headers":
		"Authorization, Content-Type, Accept",
	"Access-Control-Allow-Methods":
		"GET, POST, PATCH, OPTIONS"
};

function portalJson(
	body: unknown,
	status = 200
): Response {
	return Response.json(body, {
		status,
		headers: PORTAL_CORS_HEADERS
	});
}

function getBearerToken(request: Request): string | null {
	const authorization =
		request.headers.get("authorization") ?? "";

	const [scheme, token] =
		authorization.split(" ", 2);

	if (
		scheme?.toLowerCase() !== "bearer"
		|| !token
	) {
		return null;
	}

	return token;
}

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

		// Users Endpoint
		if (request.method === "GET" && url.pathname === "/users") {
			const limit = Number(url.searchParams.get("limit") ?? "25");
			const users = await listUsers(
				env.nomorescamcalls_db,
				limit
			);

			return Response.json({
				users
			});
		}

		// Screening Number Inventory Health Endpoint
		if (request.method === "GET" && url.pathname === "/inventory/screening-numbers/health") {
			const threshold = Number(url.searchParams.get("threshold") ?? "5");
			const health = await getScreeningNumberInventoryHealth(
				env.nomorescamcalls_db,
				threshold
			);

			return Response.json({
				health
			});
		}

		// Telnyx Inventory Sync Endpoint
		if (request.method === "POST" && url.pathname === "/telnyx/inventory/sync") {
			const sync = await syncTelnyxInventory(
				env.nomorescamcalls_db,
				{
					telnyxConfig: {
						apiKey: env.TELNYX_API_KEY,
						baseUrl: env.TELNYX_API_BASE_URL
					},
					voiceApplicationId: env.TELNYX_VOICE_APPLICATION_ID,
					connectionId: env.TELNYX_CONNECTION_ID
				}
			);

			return Response.json({
				sync
			});
		}

		// SIP Credential Inventory Health Endpoint
		if (request.method === "GET" && url.pathname === "/inventory/sip-credentials/health") {
			const threshold = Number(url.searchParams.get("threshold") ?? "5");
			const health = await getSipCredentialInventoryHealth(
				env.nomorescamcalls_db,
				threshold
			);

			return Response.json({
				health
			});
		}

		// Telnyx SIP Credential Sync Endpoint
		if (request.method === "POST" && url.pathname === "/telnyx/sip-credentials/sync") {
			const sync = await syncTelnyxSipCredentials(
				env.nomorescamcalls_db,
				{
					telnyxConfig: {
						apiKey: env.TELNYX_API_KEY,
						baseUrl: env.TELNYX_API_BASE_URL
					},
					connectionId: env.TELNYX_CONNECTION_ID
				}
			);

			return Response.json({
				sync
			});
		}

		// Create or Update User Endpoint
		if (request.method === "POST" && url.pathname === "/users") {
			const body = await request.json() as {
				phoneNumber?: string;
				screeningNumber?: string | null;
				sipUsername?: string | null;
				status?: string;
			};

			const phoneNumber = body.phoneNumber ?? "";

			if (!phoneNumber) {
				return Response.json({
					error: "phoneNumber is required"
				}, {
					status: 400
				});
			}

			const user = await createUser(
				env.nomorescamcalls_db,
				{
					phoneNumber,
					screeningNumber: body.screeningNumber ?? null,
					sipUsername: body.sipUsername ?? null,
					status: body.status ?? "active"
				}
			);

			return Response.json({
				user
			});
		}


		// Subscriber Portal CORS Preflight
		if (
			request.method === "OPTIONS"
			&& url.pathname.startsWith("/portal/")
		) {
			return new Response(null, {
				status: 204,
				headers: PORTAL_CORS_HEADERS
			});
		}

		// Subscriber Portal Invite Validation
		if (
			request.method === "POST"
			&& url.pathname === "/portal/invite-codes/validate"
		) {
			const body = await request.json() as {
				code?: string;
			};

			const code =
				body.code?.trim().toUpperCase() ?? "";

			if (!code) {
				return portalJson(
					{
						valid: false,
						error: "Invitation code is required"
					},
					400
				);
			}

			const invite = await validateBetaInviteCode(
				env.nomorescamcalls_db,
				code
			);

			if (!invite) {
				return portalJson(
					{
						valid: false,
						message:
							"This invitation code is not valid or is no longer available."
					},
					404
				);
			}

			return portalJson({
				valid: true,
				code: invite.code,
				expiresAt: invite.expiresAt
			});
		}

		// Subscriber Portal Registration
		if (
			request.method === "POST"
			&& url.pathname === "/portal/auth/register"
		) {
			const body = await request.json() as {
				code?: string;
				firstName?: string;
				lastName?: string;
				email?: string;
				phoneNumber?: string;
				carrier?: string;
				contactMethod?: string;
				password?: string;
			};

			const code =
				body.code?.trim().toUpperCase() ?? "";
			const firstName =
				body.firstName?.trim() ?? "";
			const lastName =
				body.lastName?.trim() ?? "";
			const email =
				body.email?.trim() ?? "";
			const phoneNumber =
				body.phoneNumber?.trim() ?? "";
			const carrier =
				body.carrier?.trim() ?? "";
			const contactMethod =
				body.contactMethod?.trim() ?? "";
			const password =
				body.password ?? "";

			if (
				!code
				|| !firstName
				|| !lastName
				|| !email
				|| !phoneNumber
				|| !carrier
				|| !contactMethod
				|| !password
			) {
				return portalJson(
					{
						error:
							"code, firstName, lastName, email, phoneNumber, carrier, contactMethod, and password are required"
					},
					400
				);
			}

			try {
				const registration =
					await registerBetaParticipant(
						env.nomorescamcalls_db,
						{
							code,
							firstName,
							lastName,
							email,
							phoneNumber,
							carrier,
							contactMethod,
							password
						}
					);

				if (!registration) {
					return portalJson(
						{
							error:
								"Invitation code is invalid or unavailable"
						},
						409
					);
				}

				const login =
					await loginBetaParticipant(
						env.nomorescamcalls_db,
						email,
						password
					);

				if (!login) {
					return portalJson(
						{
							error:
								"Account was created but the portal session could not be started"
						},
						500
					);
				}

				return portalJson(
					{
						registered: true,
						token: login.sessionToken,
						sessionToken:
							login.sessionToken,
						expiresAt:
							login.expiresAt,
						user:
							login.user
					},
					201
				);
			} catch (error) {
				const reason =
					error instanceof Error
						? error.message
						: "Registration failed";

				console.error("Portal registration failed", {
					reason,
					error
				});

				return portalJson(
					{
						error:
							"Registration failed",
						reason
					},
					409
				);
			}
		}

		// Subscriber Portal Login
		if (
			request.method === "POST"
			&& url.pathname === "/portal/auth/login"
		) {
			const body = await request.json() as {
				email?: string;
				password?: string;
			};

			const email =
				body.email?.trim() ?? "";
			const password =
				body.password ?? "";

			if (!email || !password) {
				return portalJson(
					{
						error:
							"email and password are required"
					},
					400
				);
			}

			const login =
				await loginBetaParticipant(
					env.nomorescamcalls_db,
					email,
					password
				);

			if (!login) {
				return portalJson(
					{
						error:
							"Invalid email or password"
					},
					401
				);
			}

			return portalJson({
				authenticated: true,
				token: login.sessionToken,
				sessionToken:
					login.sessionToken,
				expiresAt:
					login.expiresAt,
				user:
					login.user
			});
		}

		// Subscriber Portal Dashboard Summary
		if (
			request.method === "GET"
			&& url.pathname === "/portal/me/summary"
		) {
			const sessionToken =
				getBearerToken(request);

			if (!sessionToken) {
				return portalJson(
					{
						error:
							"Valid portal session required"
					},
					401
				);
			}

			const session =
				await authenticateBetaSession(
					env.nomorescamcalls_db,
					sessionToken
				);

			if (!session) {
				return portalJson(
					{
						error:
							"Valid portal session required"
					},
					401
				);
			}

			interface PortalCallSummaryRow {
				total_calls: number;
				successful_calls: number;
				diverted_calls: number;
				last_call_at: string | null;
			}

			const callSummary =
				await env.nomorescamcalls_db
					.prepare(`
						SELECT
							COUNT(*) AS total_calls,
							COALESCE(
								SUM(
									CASE
										WHEN LOWER(decision) IN (
											'allow',
											'allowed',
											'release',
											'released',
											'connect',
											'connected',
											'successful'
										)
										THEN 1
										ELSE 0
									END
								),
								0
							) AS successful_calls,
							COALESCE(
								SUM(
									CASE
										WHEN LOWER(decision) IN (
											'allow',
											'allowed',
											'release',
											'released',
											'connect',
											'connected',
											'successful'
										)
										THEN 0
										ELSE 1
									END
								),
								0
							) AS diverted_calls,
							MAX(created_at) AS last_call_at
						FROM call_events
						WHERE user_id = ?
					`)
					.bind(session.user.id)
					.first<PortalCallSummaryRow>();

			return portalJson({
				service_status:
					session.user.setupStatus,
				screening_number:
					session.user.screeningNumber,
				total_calls:
					callSummary?.total_calls ?? 0,
				successful_calls:
					callSummary?.successful_calls ?? 0,
				diverted_calls:
					callSummary?.diverted_calls ?? 0,
				last_call_at:
					callSummary?.last_call_at ?? null
			});
		}

		// Subscriber Portal Recent Calls
		if (
			request.method === "GET"
			&& url.pathname === "/portal/me/calls"
		) {
			const sessionToken =
				getBearerToken(request);

			if (!sessionToken) {
				return portalJson(
					{
						error:
							"Valid portal session required"
					},
					401
				);
			}

			const session =
				await authenticateBetaSession(
					env.nomorescamcalls_db,
					sessionToken
				);

			if (!session) {
				return portalJson(
					{
						error:
							"Valid portal session required"
					},
					401
				);
			}

			const requestedLimit =
				Number.parseInt(
					url.searchParams.get("limit") ?? "20",
					10
				);

			const limit =
				Number.isFinite(requestedLimit)
					? Math.max(
						1,
						Math.min(requestedLimit, 100)
					)
					: 20;

			interface PortalCallRow {
				id: number;
				decision: string;
				score: number;
				reason: string;
				created_at: string;
			}

			const result =
				await env.nomorescamcalls_db
					.prepare(`
						SELECT
							id,
							decision,
							score,
							reason,
							created_at
						FROM call_events
						WHERE user_id = ?
						ORDER BY id DESC
						LIMIT ?
					`)
					.bind(
						session.user.id,
						limit
					)
					.all<PortalCallRow>();

			const calls =
				result.results.map((call) => {
					const successfulDecisions =
						new Set([
							"allow",
							"allowed",
							"release",
							"released",
							"connect",
							"connected",
							"successful"
						]);

					const outcome =
						successfulDecisions.has(
							call.decision.toLowerCase()
						)
							? "successful"
							: "diverted";

					return {
						id: call.id,
						call_id: call.id,
						occurred_at:
							call.created_at,
						outcome,
						status: outcome,
						decision:
							call.decision,
						score: call.score,
						reason: call.reason
					};
				});

			return portalJson({
				calls
			});
		}

		// Subscriber Portal Current User
		if (
			request.method === "GET"
			&& url.pathname === "/portal/me"
		) {
			const sessionToken =
				getBearerToken(request);

			if (!sessionToken) {
				return portalJson(
					{
						error:
							"Valid portal session required"
					},
					401
				);
			}

			const session =
				await authenticateBetaSession(
					env.nomorescamcalls_db,
					sessionToken
				);

			if (!session) {
				return portalJson(
					{
						error:
							"Valid portal session required"
					},
					401
				);
			}

			const agreement =
				await getCurrentBetaAgreement(
					env.nomorescamcalls_db
				);

			const agreementAccepted =
				agreement
					? await hasAcceptedCurrentBetaAgreement(
							env.nomorescamcalls_db,
							session.user.id
						)
					: false;

			return portalJson({
				user: {
					...session.user,
					account_status:
						session.user.accountStatus,
					setup_status:
						session.user.setupStatus,
					screening_number:
						session.user.screeningNumber,
					agreementAccepted,
					agreementVersion:
						agreement?.version ?? null,
					agreement_accepted:
						agreementAccepted,
					agreement_version:
						agreement?.version ?? null
				},
				expiresAt:
					session.expiresAt
			});
		}

		// Subscriber Portal Agreement Acceptance
		if (
			request.method === "POST"
			&& url.pathname === "/portal/agreement/accept"
		) {
			const sessionToken =
				getBearerToken(request);

			if (!sessionToken) {
				return portalJson(
					{
						error:
							"Valid portal session required"
					},
					401
				);
			}

			const session =
				await authenticateBetaSession(
					env.nomorescamcalls_db,
					sessionToken
				);

			if (!session) {
				return portalJson(
					{
						error:
							"Valid portal session required"
					},
					401
				);
			}

			const body = await request.json() as {
				version?: string;
			};

			const agreement =
				await getCurrentBetaAgreement(
					env.nomorescamcalls_db
				);

			if (!agreement) {
				return portalJson(
					{
						error:
							"No active beta agreement"
					},
					404
				);
			}

			if (
				body.version
				&& body.version !== agreement.version
			) {
				return portalJson(
					{
						error:
							"Agreement version is not current"
					},
					409
				);
			}

			const acceptance =
				await acceptCurrentBetaAgreement(
					env.nomorescamcalls_db,
					session.user.id
				);

			if (!acceptance) {
				return portalJson(
					{
						error:
							"No active beta agreement"
					},
					404
				);
			}

			let provisioning;

			try {
				provisioning =
					await provisionSubscriber(
						env.nomorescamcalls_db,
						session.user.id
					);
			} catch (error) {
				return portalJson(
					{
						error:
							error instanceof Error
								? error.message
								: "Subscriber provisioning failed"
					},
					409
				);
			}

			return portalJson({
				accepted: true,
				agreement:
					acceptance.agreement,
				acceptedAt:
					acceptance.acceptedAt,
				provisioning: {
					status:
						provisioning.provisioningStatus,
					coverageStatus:
						provisioning.coverageStatus,
					screeningNumber:
						provisioning.user.screeningNumber,
					sipUsername:
						provisioning.user.sipUsername,
					steps:
						provisioning.steps
				}
			});
		}

		// Subscriber Portal Logout
		if (
			request.method === "POST"
			&& url.pathname === "/portal/auth/logout"
		) {
			const sessionToken =
				getBearerToken(request);

			if (!sessionToken) {
				return portalJson(
					{
						error:
							"Valid portal session required"
					},
					401
				);
			}

			const loggedOut =
				await logoutBetaParticipant(
					env.nomorescamcalls_db,
					sessionToken
				);

			if (!loggedOut) {
				return portalJson(
					{
						error:
							"Valid portal session required"
					},
					401
				);
			}

			return portalJson({
				loggedOut: true
			});
		}

		// Beta Participant Registration Endpoint
		if (request.method === "POST" && url.pathname === "/beta/register") {
			const body = await request.json() as {
				code?: string;
				firstName?: string;
				lastName?: string;
				email?: string;
				phoneNumber?: string;
				carrier?: string;
				contactMethod?: string;
				password?: string;
			};

			const code = body.code?.trim() ?? "";
			const firstName = body.firstName?.trim() ?? "";
			const lastName = body.lastName?.trim() ?? "";
			const email = body.email?.trim() ?? "";
			const phoneNumber = body.phoneNumber?.trim() ?? "";
			const carrier = body.carrier?.trim() ?? "";
			const contactMethod = body.contactMethod?.trim() ?? "";
			const password = body.password ?? "";

			if (
				!code
				|| !firstName
				|| !lastName
				|| !email
				|| !phoneNumber
				|| !carrier
				|| !contactMethod
				|| !password
			) {
				return Response.json({
					error: "code, firstName, lastName, email, phoneNumber, carrier, contactMethod, and password are required"
				}, {
					status: 400
				});
			}

			try {
				const registration = await registerBetaParticipant(
					env.nomorescamcalls_db,
					{
						code,
						firstName,
						lastName,
						email,
						phoneNumber,
						carrier,
						contactMethod,
						password
					}
				);

				if (!registration) {
					return Response.json({
						error: "Beta invite code is invalid or unavailable"
					}, {
						status: 409
					});
				}

				return Response.json({
					registered: true,
					registration
				}, {
					status: 201
				});
			} catch (error) {
				const reason = error instanceof Error
					? error.message
					: "Registration failed";

				return Response.json({
					error: "Registration failed",
					reason
				}, {
					status: 409
				});
			}
		}

		// Beta Participant Login Endpoint
		if (request.method === "POST" && url.pathname === "/beta/login") {
			const body = await request.json() as {
				email?: string;
				password?: string;
			};

			const email = body.email?.trim() ?? "";
			const password = body.password ?? "";

			if (!email || !password) {
				return Response.json({
					error: "email and password are required"
				}, {
					status: 400
				});
			}

			const login = await loginBetaParticipant(
				env.nomorescamcalls_db,
				email,
				password
			);

			if (!login) {
				return Response.json({
					error: "Invalid email or password"
				}, {
					status: 401
				});
			}

			return Response.json({
				authenticated: true,
				login
			});
		}

		// Beta Participant Session Endpoint
		if (request.method === "GET" && url.pathname === "/beta/session") {
			const authorization = request.headers.get("authorization") ?? "";
			const [scheme, sessionToken] = authorization.split(" ", 2);

			if (
				scheme?.toLowerCase() !== "bearer"
				|| !sessionToken
			) {
				return Response.json({
					error: "Valid beta session required"
				}, {
					status: 401
				});
			}

			const session = await authenticateBetaSession(
				env.nomorescamcalls_db,
				sessionToken
			);

			if (!session) {
				return Response.json({
					error: "Valid beta session required"
				}, {
					status: 401
				});
			}

			return Response.json({
				authenticated: true,
				session
			});
		}

		// Current Beta Agreement Endpoint
		if (request.method === "GET" && url.pathname === "/beta/agreement") {
			const authorization = request.headers.get("authorization") ?? "";
			const [scheme, sessionToken] = authorization.split(" ", 2);

			if (
				scheme?.toLowerCase() !== "bearer"
				|| !sessionToken
			) {
				return Response.json({
					error: "Valid beta session required"
				}, {
					status: 401
				});
			}

			const session = await authenticateBetaSession(
				env.nomorescamcalls_db,
				sessionToken
			);

			if (!session) {
				return Response.json({
					error: "Valid beta session required"
				}, {
					status: 401
				});
			}

			const agreement = await getCurrentBetaAgreement(
				env.nomorescamcalls_db
			);

			if (!agreement) {
				return Response.json({
					error: "No active beta agreement"
				}, {
					status: 404
				});
			}

			const accepted = await hasAcceptedCurrentBetaAgreement(
				env.nomorescamcalls_db,
				session.user.id
			);

			return Response.json({
				agreement: {
					...agreement,
					accepted
				}
			});
		}

		// Beta Participant Logout Endpoint
		if (request.method === "POST" && url.pathname === "/beta/logout") {
			const authorization = request.headers.get("authorization") ?? "";
			const [scheme, sessionToken] = authorization.split(" ", 2);

			if (
				scheme?.toLowerCase() !== "bearer"
				|| !sessionToken
			) {
				return Response.json({
					error: "Valid beta session required"
				}, {
					status: 401
				});
			}

			const loggedOut = await logoutBetaParticipant(
				env.nomorescamcalls_db,
				sessionToken
			);

			if (!loggedOut) {
				return Response.json({
					error: "Valid beta session required"
				}, {
					status: 401
				});
			}

			return Response.json({
				loggedOut: true
			});
		}

		// Allow List Endpoint
		if (request.method === "GET" && url.pathname === "/allow-list") {
			const limit = Number(url.searchParams.get("limit") ?? "25");
			const entries = await listCallerListEntries(
				env.nomorescamcalls_db,
				"allow",
				limit
			);

			return Response.json({
				entries
			});
		}

		// Add Allow List Entry Endpoint
		if (request.method === "POST" && url.pathname === "/allow-list/add") {
			const body = await request.json() as {
				phoneNumber?: string;
				reason?: string;
				userId?: number;
			};

			const phoneNumber = body.phoneNumber ?? "";
			const reason = body.reason ?? "manual_allow";
			const userId = body.userId ?? null;

			if (!phoneNumber) {
				return Response.json({
					error: "phoneNumber is required"
				}, {
					status: 400
				});
			}

			await addCallerListEntry(
				env.nomorescamcalls_db,
				"allow",
				phoneNumber,
				reason,
				userId
			);

			return Response.json({
				added: true,
				list: "allow",
				phoneNumber,
				reason
			});
		}

		// Block List Endpoint
		if (request.method === "GET" && url.pathname === "/block-list") {
			const limit = Number(url.searchParams.get("limit") ?? "25");
			const entries = await listCallerListEntries(
				env.nomorescamcalls_db,
				"block",
				limit
			);

			return Response.json({
				entries
			});
		}

		// Add Block List Entry Endpoint
		if (request.method === "POST" && url.pathname === "/block-list/add") {
			const body = await request.json() as {
				phoneNumber?: string;
				reason?: string;
			};

			const phoneNumber = body.phoneNumber ?? "";
			const reason = body.reason ?? "manual_block";

			if (!phoneNumber) {
				return Response.json({
					error: "phoneNumber is required"
				}, {
					status: 400
				});
			}

			await addCallerListEntry(
				env.nomorescamcalls_db,
				"block",
				phoneNumber,
				reason
			);

			return Response.json({
				added: true,
				list: "block",
				phoneNumber,
				reason
			});
		}

		// Remove Block List Entry Endpoint
		if (request.method === "POST" && url.pathname === "/block-list/remove") {
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

			const removed = await removeCallerListEntry(
				env.nomorescamcalls_db,
				"block",
				phoneNumber
			);

			return Response.json({
				removed,
				list: "block",
				phoneNumber
			});
		}

		// Caller Intelligence Endpoint
		if (request.method === "GET" && url.pathname === "/caller") {
			const phoneNumber = url.searchParams.get("phone") ?? "";

			if (!phoneNumber) {
				return Response.json({
					error: "Missing phone query parameter"
				}, {
					status: 400
				});
			}

			const caller = await getCallerIntelligence(
				env.nomorescamcalls_db,
				phoneNumber
			);

			return Response.json({
				caller
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

		// Knowledge Engine Search Endpoint
		if (
			request.method === "POST"
			&& url.pathname === "/knowledge/search"
		) {
			const body = await request.json() as {
				criteria?: Record<
					string,
					string
					| number
					| boolean
					| null
					| Array<string | number>
				>;
				sortField?: string;
				sortDirection?: "ASC" | "DESC";
				limit?: number;
				offset?: number;
			};

			const result =
				await searchEvidenceLibrary(
					env.nomorescamcalls_db,
					{
						criteria:
							body.criteria ?? {},
						sortField:
							body.sortField,
						sortDirection:
							body.sortDirection,
						limit: body.limit,
						offset: body.offset
					}
				);

			return Response.json({
				result
			});
		}

		// Knowledge Engine Search History Endpoint
		if (
			request.method === "GET"
			&& url.pathname ===
				"/knowledge/search-history"
		) {
			const limit = Number(
				url.searchParams.get("limit")
					?? "100"
			);

			const history =
				await listSearchHistory(
					env.nomorescamcalls_db,
					limit
				);

			return Response.json({
				history
			});
		}

		// Knowledge Engine Recipe Catalog Endpoint
		if (
			request.method === "GET"
			&& url.pathname ===
				"/knowledge/recipes"
		) {
			const limit = Number(
				url.searchParams.get("limit")
					?? "100"
			);

			const recipes =
				await listRecipeCatalog(
					env.nomorescamcalls_db,
					limit
				);

			return Response.json({
				recipes
			});
		}

		// Add Search to Recipe Catalog Endpoint
		if (
			request.method === "POST"
			&& url.pathname ===
				"/knowledge/recipes"
		) {
			const body = await request.json() as {
				searchHistoryId?: number;
				title?: string;
				purpose?: string;
			};

			if (
				!body.searchHistoryId
				|| !body.title?.trim()
				|| !body.purpose?.trim()
			) {
				return Response.json(
					{
						error:
							"searchHistoryId, title, and purpose are required"
					},
					{
						status: 400
					}
				);
			}

			const recipe =
				await addSearchToRecipeCatalog(
					env.nomorescamcalls_db,
					{
						searchHistoryId:
							body.searchHistoryId,
						title: body.title,
						purpose: body.purpose
					}
				);

			return Response.json({
				recipe
			});
		}

		// Run Knowledge Engine Recipe Endpoint
		if (
			request.method === "POST"
			&& /^\/knowledge\/recipes\/\d+\/run$/
				.test(url.pathname)
		) {
			const recipeId = Number(
				url.pathname.split("/")[3]
			);

			const body = await request.json() as {
				limit?: number;
				offset?: number;
			};

			const result =
				await runRecipe(
					env.nomorescamcalls_db,
					recipeId,
					{
						limit: body.limit,
						offset: body.offset
					}
				);

			return Response.json({
				result
			});
		}


		// Telnyx Voice Application Diagnostic Endpoint
		if (request.method === "GET" && url.pathname === "/telnyx/voice-application") {
			if (!env.TELNYX_VOICE_APPLICATION_ID) {
				return Response.json({
					error: "TELNYX_VOICE_APPLICATION_ID is not configured"
				}, {
					status: 503
				});
			}

			const voiceApplication = await fetchTelnyxVoiceApplication(
				env.TELNYX_VOICE_APPLICATION_ID,
				{
					apiKey: env.TELNYX_API_KEY,
					baseUrl: env.TELNYX_API_BASE_URL
				}
			);

			return Response.json({
				voiceApplication
			});
		}

		// Telnyx Recordings Diagnostic Endpoint
		if (request.method === "GET" && url.pathname === "/telnyx/recordings") {
			const recordings = await fetchTelnyxRecordings({
				apiKey: env.TELNYX_API_KEY,
				baseUrl: env.TELNYX_API_BASE_URL
			}, url.searchParams.get("call_session_id"));

			return Response.json({
				recordings
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
			const executionPolicy = getTelnyxExecutionPolicy(env);

			return handleTelnyxWebhook(
				payload,
				env.nomorescamcalls_db,
				executionPolicy,
				{
					apiKey: env.TELNYX_API_KEY,
					baseUrl: env.TELNYX_API_BASE_URL
				},
				env.BLOCK3_LIVE_SESSIONS
			);
		}

		return new Response("Not Found", {
			status: 404
		});
	}
} satisfies ExportedHandler<Env>;
