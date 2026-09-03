import {
	authenticateBetaSession,
	type BetaSessionResult
} from "./betaSession";

const ADMINISTRATIVE_ROLES = new Set([
	"admin",
	"administrator"
]);

const BETA_CUSTOMER_ROLES = new Set([
	"subscriber",
	"participant"
]);

export type PortalAuthorizationFailure =
	| "unauthenticated"
	| "forbidden";

export type PortalAuthorizationResult =
	| {
		authorized: true;
		session: BetaSessionResult;
	}
	| {
		authorized: false;
		failure: PortalAuthorizationFailure;
	};

async function authorizePortalSessionForRoles(
	db: D1Database,
	sessionToken: string | null,
	allowedRoles: ReadonlySet<string>
): Promise<PortalAuthorizationResult> {
	if (!sessionToken) {
		return {
			authorized: false,
			failure: "unauthenticated"
		};
	}

	const session = await authenticateBetaSession(db, sessionToken);

	if (!session) {
		return {
			authorized: false,
			failure: "unauthenticated"
		};
	}

	if (!allowedRoles.has(session.user.role)) {
		return {
			authorized: false,
			failure: "forbidden"
		};
	}

	return {
		authorized: true,
		session
	};
}

export function isAdministrativeRole(role: string): boolean {
	return ADMINISTRATIVE_ROLES.has(role);
}

export function authorizeAdministrativePortalSession(
	db: D1Database,
	sessionToken: string | null
): Promise<PortalAuthorizationResult> {
	return authorizePortalSessionForRoles(
		db,
		sessionToken,
		ADMINISTRATIVE_ROLES
	);
}

export function authorizeBetaCustomerPortalSession(
	db: D1Database,
	sessionToken: string | null
): Promise<PortalAuthorizationResult> {
	return authorizePortalSessionForRoles(
		db,
		sessionToken,
		BETA_CUSTOMER_ROLES
	);
}
