import { screenPhoneNumber } from "./services/screening";
import { recordScamSignal } from "./services/signals";
import { hashPhoneNumber } from "./utils/hash";
import { handleTelnyxWebhook } from "./services/telnyxWebhookHandler";
import { listRecentTelnyxWebhookEvents } from "./services/telnyxAudit";
import { verifyTelnyxWebhook } from "./services/telnyxSecurity";
import {
	createTelnyxSmsProvider,
	handleTelnyxMessagingWebhook,
	isTelnyxMessagingWebhook,
	type TelnyxMessagingConfig
} from "./services/telnyxMessaging";
import { listConfirmedScamNumbers, removeConfirmedScamNumber } from "./services/confirmedScams";
import { promoteConfirmedScamNumber } from "./services/scamPromotion";
import { getCallerIntelligence } from "./services/callerLookup";
import { addCallerListEntry, listCallerListEntries, removeCallerListEntry } from "./services/callerLists";
import { createUser } from "./services/users";
import { getScreeningNumberInventoryHealth } from "./services/screeningNumberInventory";
import { getSipCredentialInventoryHealth } from "./services/sipCredentialInventory";
import { getTelnyxExecutionPolicy } from "./services/telnyxExecutionPolicy";
import {
	provisionProtectedLine,
	ProtectedLineProvisioningError
} from "./services/provisioning";
import {
	createAccountLocation,
	createProtectedLine,
	confirmProtectedLineForwarding,
	findProtectedLineById,
	listAccountLocations,
	listCustomerProtectedLinesForAccount,
	toCustomerProtectedLine,
	ProtectedLineError
} from "./services/protectedLines";
import { syncTelnyxInventory } from "./services/telnyxInventorySync";
import { syncTelnyxSipCredentials } from "./services/telnyxSipCredentialSync";
import { fetchTelnyxVoiceApplication } from "./services/telnyxVoiceApplicationsClient";
import { fetchTelnyxRecordings } from "./services/telnyxRecordingsClient";
import { validateBetaInviteCode } from "./services/betaInviteCodes";
import {
	BetaInvitationError,
	issueBetaInvitation,
	respondToBetaInvitation
} from "./services/betaInvitations";
import { registerBetaParticipant } from "./services/betaRegistration";
import { loginBetaParticipant } from "./services/betaLogin";
import { authenticateBetaSession } from "./services/betaSession";
import {
	AdministrativeReviewError,
	handleAdministrativeReviewGate
} from "./services/administrativeReview";
import { logoutBetaParticipant } from "./services/betaLogout";
import {
	acceptCurrentBetaAgreement,
	getCurrentBetaAgreement,
	hasAcceptedCurrentBetaAgreement
} from "./services/betaAgreement";
import {
	authorizeAdministrativePortalSession,
	authorizeBetaCustomerPortalSession,
	isAdministrativeRole
} from "./services/portalAuthorization";
import { hashPassword } from "./utils/passwordHash";
import {
	updateSubscriberOnboarding
} from "./services/subscriberOnboarding";
import {
	advanceSubscriberLifecycle
} from "./services/subscriberLifecycle";
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

function telnyxMessagingConfig(env: Env): TelnyxMessagingConfig {
	return {
		apiKey: env.TELNYX_API_KEY,
		baseUrl: env.TELNYX_API_BASE_URL,
		liveExecution: env.TELNYX_LIVE_EXECUTION,
		messagingProfileId: env.TELNYX_MESSAGING_PROFILE_ID,
		fromNumber: env.TELNYX_MESSAGING_FROM_NUMBER,
		portalOrigin: env.PORTAL_ORIGIN
	};
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

		// The single administrative/support/compliance customer-review gate.
		if (
			request.method === "POST"
			&& url.pathname === "/admin/review"
		) {
			const authorization =
				await authorizeAdministrativePortalSession(
					env.nomorescamcalls_db,
					getBearerToken(request)
				);

			if (!authorization.authorized) {
				return portalJson({
					error: authorization.failure === "forbidden"
						? "Administrative role required"
						: "Valid administrative portal session required",
					code: authorization.failure === "forbidden"
						? "administrative_review_forbidden"
						: "administrative_review_unauthenticated"
				}, authorization.failure === "forbidden" ? 403 : 401);
			}

			try {
				const result = await handleAdministrativeReviewGate(
					env.nomorescamcalls_db,
					authorization.session.user,
					await request.json() as Record<string, unknown>
				);

				return portalJson(result);
			} catch (error) {
				if (error instanceof AdministrativeReviewError) {
					return portalJson({
						error: error.message,
						code: error.code
					}, error.status);
				}

				console.error("Administrative review gate failed", {
					error
				});

				return portalJson({
					error: "Administrative review failed",
					code: "administrative_review_failed"
				}, 500);
			}
		}

		// Authorized operational beta-invitation issuance.
		if (
			request.method === "POST"
			&& url.pathname === "/beta/invitations"
		) {
			const authorization =
				await authorizeAdministrativePortalSession(
					env.nomorescamcalls_db,
					getBearerToken(request)
				);

			if (!authorization.authorized) {
				return portalJson({
					error: authorization.failure === "forbidden"
						? "Administrative role required"
						: "Valid administrative portal session required",
					code: authorization.failure === "forbidden"
						? "beta_invitation_forbidden"
						: "beta_invitation_unauthenticated"
				}, authorization.failure === "forbidden" ? 403 : 401);
			}

			const body = await request.json() as {
				smsContactNumber?: string;
				smsCapable?: boolean;
				email?: string;
				expiresAt?: string;
			};

			try {
				const messagingConfig = telnyxMessagingConfig(env);
				return portalJson(await issueBetaInvitation(
					env.nomorescamcalls_db,
					authorization.session.user,
					body,
					{
						provider: createTelnyxSmsProvider(messagingConfig)
					}
				), 201);
			} catch (error) {
				if (error instanceof BetaInvitationError) {
					return portalJson({
						error: error.message,
						code: error.code
					}, error.status);
				}

				throw error;
			}
		}

		// Provider-neutral boundary for an affirmative invitation response.
		if (
			request.method === "POST"
			&& url.pathname === "/beta/invitations/respond"
		) {
			const body = await request.json() as {
				responseToken?: string;
				response?: string;
			};

			try {
				const messagingConfig = telnyxMessagingConfig(env);
				return portalJson(await respondToBetaInvitation(
					env.nomorescamcalls_db,
					{
						responseToken: body.responseToken ?? "",
						response: body.response ?? ""
					},
					{
						provider: createTelnyxSmsProvider(messagingConfig),
						portalOrigin: messagingConfig.portalOrigin
					}
				));
			} catch (error) {
				if (error instanceof BetaInvitationError) {
					return portalJson({
						error: error.message,
						code: error.code
					}, error.status);
				}

				throw error;
			}
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

		// Create Subscriber Account Endpoint
		if (request.method === "POST" && url.pathname === "/users") {
			const body = await request.json() as {
				firstName?: string;
				lastName?: string;
				contactPhoneNumber?: string;
				email?: string;
				contactMethod?: string;
				password?: string;
			};

			const contactPhoneNumber =
				body.contactPhoneNumber?.trim() ?? "";

			if (!contactPhoneNumber) {
				return Response.json({
					error: "contactPhoneNumber is required"
				}, {
					status: 400
				});
			}

			try {
				const password = body.password?.trim();
				const user = await createUser(
					env.nomorescamcalls_db,
					{
						firstName: body.firstName?.trim() || null,
						lastName: body.lastName?.trim() || null,
						contactPhoneNumber,
						email: body.email?.trim().toLowerCase() || null,
						contactMethod: body.contactMethod?.trim() || null,
						passwordHash: password
							? await hashPassword(password)
							: null,
						role: "subscriber"
					}
				);

				return Response.json({ user }, { status: 201 });
			} catch (error) {
				return Response.json({
					error: "Subscriber account could not be created",
					reason: error instanceof Error
						? error.message
						: "Unknown account creation error"
				}, {
					status: 409
				});
			}
		}

		const onboardingUserMatch =
			url.pathname.match(/^\/users\/(\d+)\/onboarding$/);

		if (request.method === "PATCH" && onboardingUserMatch) {
			const userId = Number(onboardingUserMatch[1]);
			const body = await request.json() as {
				firstName?: string;
				lastName?: string;
				email?: string;
				contactPhoneNumber?: string;
				contactMethod?: string;
				password?: string;
			};

			try {
				const onboarding = await updateSubscriberOnboarding(
					env.nomorescamcalls_db,
					userId,
					body
				);
				const lifecycle = onboarding.complete
					? await advanceSubscriberLifecycle(
						env.nomorescamcalls_db,
						userId
					)
					: { onboarding, provisioning: null };

				return Response.json(lifecycle);
			} catch (error) {
				return Response.json({
					error: error instanceof Error
						? error.message
						: "Subscriber onboarding update failed"
				}, {
					status: 409
				});
			}
		}

		const accountLocationsMatch =
			url.pathname.match(/^\/users\/(\d+)\/locations$/);

		if (request.method === "POST" && accountLocationsMatch) {
			try {
				return Response.json({
					location: await createAccountLocation(
						env.nomorescamcalls_db,
						Number(accountLocationsMatch[1])
					)
				}, { status: 201 });
			} catch (error) {
				return Response.json({
					error: error instanceof Error ? error.message : "Location creation failed",
					code: error instanceof ProtectedLineError ? error.code : "location_creation_failed"
				}, { status: 409 });
			}
		}

		const protectedLinesMatch = url.pathname.match(
			/^\/users\/(\d+)\/locations\/(\d+)\/protected-lines$/
		);

		if (request.method === "POST" && protectedLinesMatch) {
			const body = await request.json() as {
				protectedPhoneNumber?: string;
				callerFacingBusinessName?: string;
				carrier?: string;
			};

			try {
				return Response.json({
					protectedLine: await createProtectedLine(
						env.nomorescamcalls_db,
						Number(protectedLinesMatch[1]),
						Number(protectedLinesMatch[2]),
						{
							protectedPhoneNumber: body.protectedPhoneNumber ?? "",
							callerFacingBusinessName: body.callerFacingBusinessName ?? "",
							carrier: body.carrier
						}
					)
				}, { status: 201 });
			} catch (error) {
				return Response.json({
					error: error instanceof Error ? error.message : "Protected-line creation failed",
					code: error instanceof ProtectedLineError ? error.code : "protected_line_creation_failed"
				}, { status: 409 });
			}
		}

		const provisionLineMatch =
			url.pathname.match(/^\/protected-lines\/(\d+)\/provision$/);

		if (request.method === "POST" && provisionLineMatch) {
			try {
				const messagingConfig = telnyxMessagingConfig(env);
				return Response.json({
					provisioning: await provisionProtectedLine(
						env.nomorescamcalls_db,
						Number(provisionLineMatch[1]),
						{
							provider: createTelnyxSmsProvider(messagingConfig)
						}
					)
				});
			} catch (error) {
				return Response.json({
					error: error instanceof Error ? error.message : "Protected-line provisioning failed",
					code: error instanceof ProtectedLineProvisioningError
						? error.code
						: "protected_line_provisioning_failed",
					missingRequirements: error instanceof ProtectedLineProvisioningError
						? error.missingRequirements
						: []
				}, { status: 409 });
			}
		}

		// Authenticated customer Location creation.
		if (
			request.method === "POST"
			&& url.pathname === "/portal/me/locations"
		) {
			const authorization = await authorizeBetaCustomerPortalSession(
				env.nomorescamcalls_db,
				getBearerToken(request)
			);
			if (!authorization.authorized) {
				return portalJson({
					error: authorization.failure === "forbidden"
						? "Beta customer role required"
						: "Valid portal session required"
				}, authorization.failure === "forbidden" ? 403 : 401);
			}
			if (authorization.session.user.setupStatus !== "onboarding_complete") {
				return portalJson({
					error: "Account onboarding and agreement must be complete",
					code: "onboarding_incomplete"
				}, 409);
			}

			try {
				return portalJson({
					location: await createAccountLocation(
						env.nomorescamcalls_db,
						authorization.session.user.id
					)
				}, 201);
			} catch (error) {
				return portalJson({
					error: error instanceof Error ? error.message : "Location creation failed",
					code: error instanceof ProtectedLineError
						? error.code
						: "location_creation_failed"
				}, 409);
			}
		}

		const portalProtectedLinesMatch = url.pathname.match(
			/^\/portal\/me\/locations\/(\d+)\/protected-lines$/
		);
		if (request.method === "POST" && portalProtectedLinesMatch) {
			const authorization = await authorizeBetaCustomerPortalSession(
				env.nomorescamcalls_db,
				getBearerToken(request)
			);
			if (!authorization.authorized) {
				return portalJson({
					error: authorization.failure === "forbidden"
						? "Beta customer role required"
						: "Valid portal session required"
				}, authorization.failure === "forbidden" ? 403 : 401);
			}
			if (authorization.session.user.setupStatus !== "onboarding_complete") {
				return portalJson({
					error: "Account onboarding and agreement must be complete",
					code: "onboarding_incomplete"
				}, 409);
			}

			const body = await request.json() as {
				protectedPhoneNumber?: string;
				callerFacingBusinessName?: string;
				carrier?: string;
			};
			try {
				const line = await createProtectedLine(
					env.nomorescamcalls_db,
					authorization.session.user.id,
					Number(portalProtectedLinesMatch[1]),
					{
						protectedPhoneNumber: body.protectedPhoneNumber ?? "",
						callerFacingBusinessName: body.callerFacingBusinessName ?? "",
						carrier: body.carrier
					}
				);
				return portalJson({
					protectedLine: toCustomerProtectedLine(line)
				}, 201);
			} catch (error) {
				return portalJson({
					error: error instanceof Error ? error.message : "Protected-line creation failed",
					code: error instanceof ProtectedLineError
						? error.code
						: "protected_line_creation_failed"
				}, 409);
			}
		}

		const portalProvisionLineMatch = url.pathname.match(
			/^\/portal\/me\/protected-lines\/(\d+)\/provision$/
		);
		if (request.method === "POST" && portalProvisionLineMatch) {
			const authorization = await authorizeBetaCustomerPortalSession(
				env.nomorescamcalls_db,
				getBearerToken(request)
			);
			if (!authorization.authorized) {
				return portalJson({
					error: authorization.failure === "forbidden"
						? "Beta customer role required"
						: "Valid portal session required"
				}, authorization.failure === "forbidden" ? 403 : 401);
			}

			const lineId = Number(portalProvisionLineMatch[1]);
			const line = await findProtectedLineById(env.nomorescamcalls_db, lineId);
			if (!line || line.userId !== authorization.session.user.id) {
				return portalJson({
					error: "Protected line not found",
					code: "protected_line_not_found"
				}, 404);
			}

			try {
				const messagingConfig = telnyxMessagingConfig(env);
				return portalJson({
					provisioning: await provisionProtectedLine(
						env.nomorescamcalls_db,
						line.id,
						{
							provider: createTelnyxSmsProvider(messagingConfig)
						}
					)
				});
			} catch (error) {
				return portalJson({
					error: error instanceof Error ? error.message : "Protected-line provisioning failed",
					code: error instanceof ProtectedLineProvisioningError
						? error.code
						: "protected_line_provisioning_failed",
					missingRequirements: error instanceof ProtectedLineProvisioningError
						? error.missingRequirements
						: []
				}, 409);
			}
		}

		const portalForwardingConfirmationMatch = url.pathname.match(
			/^\/portal\/me\/protected-lines\/(\d+)\/forwarding-confirm$/
		);
		if (request.method === "POST" && portalForwardingConfirmationMatch) {
			const authorization = await authorizeBetaCustomerPortalSession(
				env.nomorescamcalls_db,
				getBearerToken(request)
			);
			if (!authorization.authorized) {
				return portalJson({
					error: authorization.failure === "forbidden"
						? "Beta customer role required"
						: "Valid portal session required"
				}, authorization.failure === "forbidden" ? 403 : 401);
			}

			try {
				const protectedLine = await confirmProtectedLineForwarding(
					env.nomorescamcalls_db,
					authorization.session.user.id,
					Number(portalForwardingConfirmationMatch[1])
				);
				return portalJson({
					forwardingConfirmed: true,
					coverageActive: true,
					protectedLine
				});
			} catch (error) {
				return portalJson({
					error: error instanceof Error ? error.message : "Forwarding confirmation failed",
					code: error instanceof ProtectedLineError
						? error.code
						: "forwarding_confirmation_failed"
				}, 409);
			}
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
				invite?: string;
			};

			const code =
				(body.invite ?? body.code)?.trim().toUpperCase() ?? "";

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
				invite?: string;
				firstName?: string;
				lastName?: string;
				email?: string;
				contactPhoneNumber?: string;
				contactMethod?: string;
				password?: string;
			};

			const code =
				(body.invite ?? body.code)?.trim().toUpperCase() ?? "";
			const firstName =
				body.firstName?.trim() ?? "";
			const lastName =
				body.lastName?.trim() ?? "";
			const email =
				body.email?.trim() ?? "";
			const contactPhoneNumber =
				body.contactPhoneNumber?.trim() ?? "";
			const contactMethod =
				body.contactMethod?.trim() ?? "";
			const password =
				body.password ?? "";

			if (
				!code
				|| !firstName
				|| !lastName
				|| !email
				|| !contactPhoneNumber
				|| !contactMethod
				|| !password
			) {
				return portalJson(
					{
						error:
						"code, firstName, lastName, email, contactPhoneNumber, contactMethod, and password are required"
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
							contactPhoneNumber,
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
			const authorization = await authorizeBetaCustomerPortalSession(
				env.nomorescamcalls_db,
				getBearerToken(request)
			);
			if (!authorization.authorized) {
				return portalJson({
					error: authorization.failure === "forbidden"
						? "Beta customer role required"
						: "Valid portal session required"
				}, authorization.failure === "forbidden" ? 403 : 401);
			}

			interface PortalCallSummaryRow {
				total_calls: number;
				successful_calls: number;
				diverted_calls: number;
				last_call_at: string | null;
			}

			const [callSummary, locations, protectedLines] = await Promise.all([
				env.nomorescamcalls_db
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
					.bind(authorization.session.user.id)
					.first<PortalCallSummaryRow>(),
				listAccountLocations(
					env.nomorescamcalls_db,
					authorization.session.user.id
				),
				listCustomerProtectedLinesForAccount(
					env.nomorescamcalls_db,
					authorization.session.user.id
				)
			]);

			return portalJson({
				service_status:
					authorization.session.user.setupStatus,
				locations,
				protected_lines: protectedLines,
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
			const authorization = await authorizeBetaCustomerPortalSession(
				env.nomorescamcalls_db,
				getBearerToken(request)
			);
			if (!authorization.authorized) {
				return portalJson({
					error: authorization.failure === "forbidden"
						? "Beta customer role required"
						: "Valid portal session required"
				}, authorization.failure === "forbidden" ? 403 : 401);
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
							authorization.session.user.id,
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

			if (isAdministrativeRole(session.user.role)) {
				return portalJson({
					user: {
						...session.user,
						account_status: session.user.accountStatus,
						setup_status: session.user.setupStatus,
						contact_phone_number: session.user.contactPhoneNumber
					},
					locations: [],
					protected_lines: [],
					expiresAt: session.expiresAt
				});
			}

			const agreement = getCurrentBetaAgreement();

			const [agreementAccepted, locations, protectedLines] =
				await Promise.all([
					hasAcceptedCurrentBetaAgreement(
						env.nomorescamcalls_db,
						session.user.id
					),
					listAccountLocations(env.nomorescamcalls_db, session.user.id),
					listCustomerProtectedLinesForAccount(env.nomorescamcalls_db, session.user.id)
				]);

			return portalJson({
				user: {
					...session.user,
					account_status:
						session.user.accountStatus,
					setup_status:
						session.user.setupStatus,
					contact_phone_number:
						session.user.contactPhoneNumber,
					agreementAccepted,
					agreementVersion: agreement.version,
					agreement_accepted:
						agreementAccepted,
					agreement_version: agreement.version
				},
				locations,
				protected_lines: protectedLines,
				expiresAt:
					session.expiresAt
			});
		}

		// Subscriber Portal Onboarding Completion
		if (
			request.method === "PATCH"
			&& url.pathname === "/portal/me/onboarding"
		) {
			const authorization =
				await authorizeBetaCustomerPortalSession(
					env.nomorescamcalls_db,
					getBearerToken(request)
				);

			if (!authorization.authorized) {
				return portalJson({
					error: authorization.failure === "forbidden"
						? "Beta customer role required"
						: "Valid portal session required"
				}, authorization.failure === "forbidden" ? 403 : 401);
			}

			const body = await request.json() as {
				firstName?: string;
				lastName?: string;
				email?: string;
				contactPhoneNumber?: string;
				contactMethod?: string;
				password?: string;
			};

			try {
				const onboarding = await updateSubscriberOnboarding(
					env.nomorescamcalls_db,
					authorization.session.user.id,
					body
				);
				const lifecycle = onboarding.complete
					? await advanceSubscriberLifecycle(
						env.nomorescamcalls_db,
						authorization.session.user.id
					)
					: { onboarding, provisioning: null };

				return portalJson(lifecycle);
			} catch (error) {
				return portalJson(
					{
						error: error instanceof Error
							? error.message
							: "Subscriber onboarding update failed"
					},
					409
				);
			}
		}

		// Subscriber Portal Current Agreement
		if (
			request.method === "GET"
			&& url.pathname === "/portal/agreement/current"
		) {
			const authorization =
				await authorizeBetaCustomerPortalSession(
					env.nomorescamcalls_db,
					getBearerToken(request)
				);

			if (!authorization.authorized) {
				return portalJson({
					error: authorization.failure === "forbidden"
						? "Beta customer role required"
						: "Valid portal session required"
				}, authorization.failure === "forbidden" ? 403 : 401);
			}

			return portalJson({
				agreement: getCurrentBetaAgreement()
			});
		}

		// Subscriber Portal Agreement Acceptance
		if (
			request.method === "POST"
			&& url.pathname === "/portal/agreement/accept"
		) {
			const authorization =
				await authorizeBetaCustomerPortalSession(
					env.nomorescamcalls_db,
					getBearerToken(request)
				);

			if (!authorization.authorized) {
				return portalJson({
					error: authorization.failure === "forbidden"
						? "Beta customer role required"
						: "Valid portal session required"
				}, authorization.failure === "forbidden" ? 403 : 401);
			}

			const body = await request.json() as {
				version?: string;
			};

			const agreement = getCurrentBetaAgreement();

			if (body.version !== agreement.version) {
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
					authorization.session.user.id
				);

			const lifecycle = await advanceSubscriberLifecycle(
				env.nomorescamcalls_db,
				authorization.session.user.id
			);

			if (!lifecycle.onboarding.complete) {
				return portalJson(
					{
						accepted: true,
						agreement: acceptance.agreement,
						acceptedAt: acceptance.acceptedAt,
						error: "Subscriber onboarding is incomplete",
						missingRequirements:
							lifecycle.onboarding.missingRequirements
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
				onboarding: lifecycle.onboarding,
				provisioning: null
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
			if (isTelnyxMessagingWebhook(payload)) {
				return handleTelnyxMessagingWebhook(
					payload,
					env.nomorescamcalls_db,
					telnyxMessagingConfig(env)
				);
			}
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
