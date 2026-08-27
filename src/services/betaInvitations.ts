import {
	deliverCustomerCommunication,
	findLatestCustomerCommunication,
	type CustomerCommunicationProvider,
	type CustomerCommunicationRecord
} from "./customerCommunications";
import type { UserRecord } from "./users";

export type BetaInvitationChannel = "sms" | "email";
export type BetaInvitationStatus =
	| "awaiting_response"
	| "credential_issued"
	| "redeemed"
	| "expired"
	| "cancelled";

export interface BetaInvitationRecord {
	id: number;
	responseToken: string;
	smsContactNumber: string | null;
	smsCapable: boolean;
	emailContact: string | null;
	selectedChannel: BetaInvitationChannel;
	selectedDestination: string;
	status: BetaInvitationStatus;
	createdByUserId: number;
	issuedAt: string;
	awaitingResponseAt: string;
	responseReceivedAt: string | null;
	acceptedAt: string | null;
	credentialIssuedAt: string | null;
	redeemedAt: string | null;
	expiresAt: string | null;
}

export interface BetaOnboardingCredential {
	code: string;
	portalPath: string;
	expiresAt: string | null;
}

export interface BetaInvitationResponseResult {
	accepted: boolean;
	invitation: BetaInvitationRecord;
	credential: BetaOnboardingCredential | null;
	delivery: CustomerCommunicationRecord | null;
}

interface BetaInvitationRow {
	id: number;
	response_token: string;
	sms_contact_number: string | null;
	sms_capable: number;
	email_contact: string | null;
	selected_channel: BetaInvitationChannel;
	selected_destination: string;
	status: BetaInvitationStatus;
	created_by_user_id: number;
	issued_at: string;
	awaiting_response_at: string;
	response_received_at: string | null;
	accepted_at: string | null;
	credential_issued_at: string | null;
	redeemed_at: string | null;
	expires_at: string | null;
}

const INVITATION_COLUMNS = `
	id,
	response_token,
	sms_contact_number,
	sms_capable,
	email_contact,
	selected_channel,
	selected_destination,
	status,
	created_by_user_id,
	issued_at,
	awaiting_response_at,
	response_received_at,
	accepted_at,
	credential_issued_at,
	redeemed_at,
	expires_at
`;

function mapInvitationRow(row: BetaInvitationRow): BetaInvitationRecord {
	return {
		id: row.id,
		responseToken: row.response_token,
		smsContactNumber: row.sms_contact_number,
		smsCapable: row.sms_capable === 1,
		emailContact: row.email_contact,
		selectedChannel: row.selected_channel,
		selectedDestination: row.selected_destination,
		status: row.status,
		createdByUserId: row.created_by_user_id,
		issuedAt: row.issued_at,
		awaitingResponseAt: row.awaiting_response_at,
		responseReceivedAt: row.response_received_at,
		acceptedAt: row.accepted_at,
		credentialIssuedAt: row.credential_issued_at,
		redeemedAt: row.redeemed_at,
		expiresAt: row.expires_at
	};
}

export class BetaInvitationError extends Error {
	constructor(
		message: string,
		readonly code: string,
		readonly status: number
	) {
		super(message);
		this.name = "BetaInvitationError";
	}
}

function defaultResponseToken(): string {
	return crypto.randomUUID();
}

function defaultInvitationCode(): string {
	return `BETA-${crypto.randomUUID().replaceAll("-", "").slice(0, 20).toUpperCase()}`;
}

function portalPath(code: string): string {
	return `/portal/onboarding?invite=${encodeURIComponent(code)}`;
}

function portalUrl(path: string, origin?: string): string {
	if (!origin?.trim()) {
		return path;
	}

	const parsedOrigin = new URL(origin);
	if (parsedOrigin.protocol !== "https:" && parsedOrigin.protocol !== "http:") {
		throw new Error("PORTAL_ORIGIN must use HTTP or HTTPS");
	}

	return new URL(path, `${parsedOrigin.origin}/`).toString();
}

async function findInvitationByResponseToken(
	db: D1Database,
	responseToken: string
): Promise<BetaInvitationRecord | null> {
	const row = await db
		.prepare(`
			SELECT ${INVITATION_COLUMNS}
			FROM beta_invitations
			WHERE response_token = ?
		`)
		.bind(responseToken)
		.first<BetaInvitationRow>();

	return row ? mapInvitationRow(row) : null;
}

async function findLatestInvitationBySmsContactNumber(
	db: D1Database,
	smsContactNumber: string
): Promise<BetaInvitationRecord | null> {
	const row = await db
		.prepare(`
			SELECT ${INVITATION_COLUMNS}
			FROM beta_invitations
			WHERE selected_channel = 'sms'
				AND sms_capable = 1
				AND sms_contact_number = ?
				AND selected_destination = ?
			ORDER BY id DESC
			LIMIT 1
		`)
		.bind(smsContactNumber, smsContactNumber)
		.first<BetaInvitationRow>();

	return row ? mapInvitationRow(row) : null;
}

async function findInvitationCode(
	db: D1Database,
	invitationId: number
): Promise<string | null> {
	const row = await db
		.prepare(`
			SELECT code
			FROM beta_invite_codes
			WHERE invitation_id = ?
		`)
		.bind(invitationId)
		.first<{ code: string }>();

	return row?.code ?? null;
}

export async function issueBetaInvitation(
	db: D1Database,
	creator: UserRecord,
	input: {
		smsContactNumber?: string | null;
		smsCapable?: boolean;
		email?: string | null;
		expiresAt?: string | null;
	},
	options: {
		now?: () => string;
		createResponseToken?: () => string;
		provider?: CustomerCommunicationProvider;
	} = {}
): Promise<{
	invitation: BetaInvitationRecord;
	delivery: CustomerCommunicationRecord;
}> {
	if (!new Set(["admin", "administrator"]).has(creator.role)) {
		throw new BetaInvitationError(
			"Administrative invitation issuance role required",
			"beta_invitation_forbidden",
			403
		);
	}

	const smsContactNumber = input.smsContactNumber?.trim() || null;
	const email = input.email?.trim().toLowerCase() || null;
	const smsCapable = input.smsCapable === true;

	if (smsCapable && !smsContactNumber) {
		throw new BetaInvitationError(
			"An explicitly SMS-capable invitation requires an SMS contact number",
			"sms_destination_required",
			400
		);
	}

	if (!smsCapable && !email) {
		throw new BetaInvitationError(
			"An email destination is required when explicit SMS capability is absent",
			"email_destination_required",
			400
		);
	}

	const selectedChannel: BetaInvitationChannel = smsCapable
		? "sms"
		: "email";
	const selectedDestination = smsCapable
		? smsContactNumber as string
		: email as string;
	const now = options.now?.() ?? new Date().toISOString();
	const expiresAt = input.expiresAt?.trim() || null;
	const expirationTime = expiresAt ? Date.parse(expiresAt) : null;

	if (
		expiresAt
		&& (
			expirationTime === null
			|| !Number.isFinite(expirationTime)
			|| expirationTime <= Date.parse(now)
		)
	) {
		throw new BetaInvitationError(
			"Invitation expiration must be in the future",
			"invalid_invitation_expiration",
			400
		);
	}

	const existingInvitation = await db
		.prepare(`
			SELECT id
			FROM beta_invitations
			WHERE selected_channel = ?
				AND selected_destination = ?
				AND status IN ('awaiting_response', 'credential_issued')
			LIMIT 1
		`)
		.bind(selectedChannel, selectedDestination)
		.first<{ id: number }>();
	if (existingInvitation) {
		throw new BetaInvitationError(
			"An invitation is already active at this destination",
			"invitation_already_active",
			409
		);
	}

	let inserted: D1Result;
	try {
		inserted = await db
			.prepare(`
				INSERT INTO beta_invitations (
					response_token,
					sms_contact_number,
					sms_capable,
					email_contact,
					selected_channel,
					selected_destination,
					status,
					created_by_user_id,
					issued_at,
					awaiting_response_at,
					expires_at,
					created_at,
					updated_at
				)
				VALUES (?, ?, ?, ?, ?, ?, 'awaiting_response', ?, ?, ?, ?, ?, ?)
			`)
			.bind(
				options.createResponseToken?.() ?? defaultResponseToken(),
				smsContactNumber,
				smsCapable ? 1 : 0,
				email,
				selectedChannel,
				selectedDestination,
				creator.id,
				now,
				now,
				expiresAt,
				now,
				now
			)
			.run();
	} catch (error) {
		if (
			error instanceof Error
			&& /idx_beta_invitations_one_awaiting_destination|UNIQUE constraint failed: beta_invitations\.selected_channel/i.test(error.message)
		) {
			throw new BetaInvitationError(
				"An invitation is already awaiting a response at this destination",
				"invitation_already_awaiting_response",
				409
			);
		}

		throw error;
	}

	const invitation = await findInvitationByResponseToken(
		db,
		await db
			.prepare("SELECT response_token FROM beta_invitations WHERE id = ?")
			.bind(Number(inserted.meta.last_row_id))
			.first<{ response_token: string }>()
			.then((row) => row?.response_token ?? "")
	);
	if (!invitation) {
		throw new Error("Failed to issue beta invitation");
	}

	const delivery = await deliverCustomerCommunication(
		db,
		{
			invitationId: invitation.id,
			purpose: "beta_invitation",
			message: {
				channel: selectedChannel,
				destination: selectedDestination,
				subject: selectedChannel === "email"
					? "NoMoreScamCalls beta invitation"
					: null,
				body: "You're invited to the NoMoreScamCalls beta. Reply Y or YES to continue."
			}
		},
		options.provider
	);

	return { invitation, delivery };
}

export async function respondToBetaInvitation(
	db: D1Database,
	input: {
		responseToken: string;
		response: string;
	},
	options: {
		now?: () => string;
		createInvitationCode?: () => string;
		provider?: CustomerCommunicationProvider;
		portalOrigin?: string;
	} = {}
): Promise<BetaInvitationResponseResult> {
	const responseToken = input.responseToken.trim();
	const normalizedResponse = input.response.trim().toUpperCase();
	const now = options.now?.() ?? new Date().toISOString();
	let invitation = await findInvitationByResponseToken(db, responseToken);

	if (!invitation) {
		throw new BetaInvitationError(
			"Beta invitation not found",
			"beta_invitation_not_found",
			404
		);
	}

	if (
		invitation.expiresAt
		&& Date.parse(invitation.expiresAt) <= Date.parse(now)
		&& invitation.status === "awaiting_response"
	) {
		await db
			.prepare(`
				UPDATE beta_invitations
				SET status = 'expired',
					response_received_at = ?,
					updated_at = ?
				WHERE id = ?
			`)
			.bind(now, now, invitation.id)
			.run();
		throw new BetaInvitationError(
			"Beta invitation has expired",
			"beta_invitation_expired",
			410
		);
	}

	if (invitation.status === "cancelled" || invitation.status === "expired") {
		throw new BetaInvitationError(
			"Beta invitation is no longer available",
			"beta_invitation_unavailable",
			409
		);
	}

	if (invitation.status === "redeemed") {
		throw new BetaInvitationError(
			"Beta invitation has already been redeemed",
			"beta_invitation_redeemed",
			409
		);
	}

	const affirmative = normalizedResponse === "Y"
		|| normalizedResponse === "YES";

	if (!affirmative) {
		await db
			.prepare(`
				UPDATE beta_invitations
				SET response_received_at = ?,
					updated_at = ?
				WHERE id = ?
					AND status = 'awaiting_response'
			`)
			.bind(now, now, invitation.id)
			.run();
		invitation = await findInvitationByResponseToken(db, responseToken)
			?? invitation;
		return {
			accepted: false,
			invitation,
			credential: null,
			delivery: null
		};
	}

	let code = await findInvitationCode(db, invitation.id);
	if (!code) {
		code = (options.createInvitationCode?.() ?? defaultInvitationCode())
			.trim()
			.toUpperCase();
		if (!code) {
			throw new Error("Invitation credential generator returned an empty code");
		}

		const results = await db.batch([
			db.prepare(`
				INSERT INTO beta_invite_codes (
					code,
					status,
					expires_at,
					max_uses,
					use_count,
					created_by_user_id,
					invitation_id,
					created_at,
					updated_at
				)
				SELECT ?, 'active', expires_at, 1, 0, created_by_user_id, id, ?, ?
				FROM beta_invitations
				WHERE id = ?
					AND status = 'awaiting_response'
			`).bind(code, now, now, invitation.id),
			db.prepare(`
				UPDATE beta_invitations
				SET status = 'credential_issued',
					response_received_at = ?,
					accepted_at = ?,
					credential_issued_at = ?,
					updated_at = ?
				WHERE id = ?
					AND status = 'awaiting_response'
			`).bind(now, now, now, now, invitation.id)
		]);

		if (results.some((result) => result.meta.changes !== 1)) {
			throw new Error("Failed to issue one-time onboarding credential");
		}
	}

	invitation = await findInvitationByResponseToken(db, responseToken)
		?? invitation;
	const credential: BetaOnboardingCredential = {
		code,
		portalPath: portalPath(code),
		expiresAt: invitation.expiresAt
	};
	let delivery = await findLatestCustomerCommunication(db, {
		invitationId: invitation.id,
		purpose: "onboarding_credential"
	});

	const providerCanRetry = Boolean(
		options.provider
		&& !options.provider.unavailableReason
		&& (
			!options.provider.channel
			|| options.provider.channel === invitation.selectedChannel
		)
	);
	if (
		!delivery
		|| (
			providerCanRetry
			&& (delivery.status === "failed" || delivery.status === "provider_unavailable")
		)
	) {
		delivery = await deliverCustomerCommunication(
			db,
			{
				invitationId: invitation.id,
				purpose: "onboarding_credential",
				message: {
					channel: invitation.selectedChannel,
					destination: invitation.selectedDestination,
					subject: invitation.selectedChannel === "email"
						? "Complete your NoMoreScamCalls beta setup"
						: null,
					body: `Tap ${portalUrl(credential.portalPath, options.portalOrigin)} to complete setup. Invitation key: ${credential.code}`
				}
			},
			options.provider
		);
	}

	return {
		accepted: true,
		invitation,
		credential,
		delivery
	};
}

export async function respondToBetaInvitationBySms(
	db: D1Database,
	input: {
		smsContactNumber: string;
		response: string;
	},
	options: {
		now?: () => string;
		createInvitationCode?: () => string;
		provider?: CustomerCommunicationProvider;
		portalOrigin?: string;
	} = {}
): Promise<BetaInvitationResponseResult> {
	const smsContactNumber = input.smsContactNumber.trim();
	if (!smsContactNumber) {
		throw new BetaInvitationError(
			"SMS invitation sender is required",
			"beta_invitation_sms_sender_required",
			400
		);
	}

	const invitation = await findLatestInvitationBySmsContactNumber(
		db,
		smsContactNumber
	);
	if (!invitation) {
		throw new BetaInvitationError(
			"No beta invitation is associated with this SMS sender",
			"beta_invitation_sms_sender_not_found",
			404
		);
	}

	return respondToBetaInvitation(
		db,
		{
			responseToken: invitation.responseToken,
			response: input.response
		},
		options
	);
}
