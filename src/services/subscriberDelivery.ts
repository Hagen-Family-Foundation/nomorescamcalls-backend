import { createSessionToken, hashSessionToken } from "../utils/sessionToken";
import {
	checkTelnyxCredentialRegistration,
	createTelnyxCredentialToken,
	createTelnyxTelephonyCredential,
	deleteTelnyxTelephonyCredential,
	retrieveTelnyxTelephonyCredential,
	type TelnyxCredentialToken,
	type TelnyxSubscriberCredentialConfig
} from "./telnyxTelephonyCredentialsClient";

export type PhonePlatform = "ios" | "android" | "other";
export type DeliveryIdentityStatus = "active" | "terminated";
export type DeviceRegistrationStatus = "pending" | "active" | "revoked";

export interface PhoneModelRecord {
	id: string;
	manufacturer: string;
	displayName: string;
	platform: PhonePlatform;
	releaseYear: number | null;
	selectable: boolean;
}

export interface DeviceRegistrationRecord {
	id: number;
	deliveryIdentityId: number;
	phoneModelId: string;
	status: DeviceRegistrationStatus;
	providerTelephonyCredentialId: string;
	providerSipUsername: string;
	providerCredentialExpiresAt: string | null;
	authorizedAt: string;
	activatedAt: string | null;
	revokedAt: string | null;
	lastProviderVerificationAt: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface AuthorizedDeviceRegistration {
	deviceRegistration: DeviceRegistrationRecord;
	deviceAuthenticator: string;
}

interface PhoneModelRow {
	id: string;
	manufacturer: string;
	display_name: string;
	platform: PhonePlatform;
	release_year: number | null;
	selectable: number;
}

interface DeviceRegistrationRow {
	id: number;
	delivery_identity_id: number;
	phone_model_id: string;
	status: DeviceRegistrationStatus;
	provider_telephony_credential_id: string;
	provider_sip_username: string;
	provider_credential_expires_at: string | null;
	device_authenticator_hash: string;
	authorized_at: string;
	activated_at: string | null;
	revoked_at: string | null;
	last_provider_verification_at: string | null;
	created_at: string;
	updated_at: string;
}

interface RegistrationContextRow extends DeviceRegistrationRow {
	delivery_identity_status: DeliveryIdentityStatus;
	protected_line_id: number;
	protected_line_user_id: number;
	account_status: string;
	account_record_status: string;
	setup_status: string;
}

const DEVICE_REGISTRATION_COLUMNS = `
	id, delivery_identity_id, phone_model_id, status,
	provider_telephony_credential_id, provider_sip_username,
	provider_credential_expires_at, device_authenticator_hash,
	authorized_at, activated_at, revoked_at,
	last_provider_verification_at, created_at, updated_at
`;

export class SubscriberDeliveryError extends Error {
	constructor(
		message: string,
		readonly code: string,
		readonly status = 409
	) {
		super(message);
		this.name = "SubscriberDeliveryError";
	}
}

function mapPhoneModel(row: PhoneModelRow): PhoneModelRecord {
	return {
		id: row.id,
		manufacturer: row.manufacturer,
		displayName: row.display_name,
		platform: row.platform,
		releaseYear: row.release_year,
		selectable: row.selectable === 1
	};
}

function mapRegistration(row: DeviceRegistrationRow): DeviceRegistrationRecord {
	return {
		id: row.id,
		deliveryIdentityId: row.delivery_identity_id,
		phoneModelId: row.phone_model_id,
		status: row.status,
		providerTelephonyCredentialId: row.provider_telephony_credential_id,
		providerSipUsername: row.provider_sip_username,
		providerCredentialExpiresAt: row.provider_credential_expires_at,
		authorizedAt: row.authorized_at,
		activatedAt: row.activated_at,
		revokedAt: row.revoked_at,
		lastProviderVerificationAt: row.last_provider_verification_at,
		createdAt: row.created_at,
		updatedAt: row.updated_at
	};
}

export async function listSelectablePhoneModels(
	db: D1Database
): Promise<PhoneModelRecord[]> {
	const rows = await db.prepare(`
		SELECT id, manufacturer, display_name, platform, release_year, selectable
		FROM phone_models
		WHERE selectable = 1
		ORDER BY CASE WHEN id = 'other-model-not-listed' THEN 1 ELSE 0 END,
			manufacturer, display_name
	`).all<PhoneModelRow>();
	return rows.results.map(mapPhoneModel);
}

async function registrationContext(
	db: D1Database,
	registrationId: number
): Promise<RegistrationContextRow | null> {
	return db.prepare(`
		SELECT dr.*, di.status AS delivery_identity_status,
			di.protected_line_id, pl.user_id AS protected_line_user_id,
			u.account_status, u.status AS account_record_status, u.setup_status
		FROM device_registrations dr
		JOIN delivery_identities di ON di.id = dr.delivery_identity_id
		JOIN protected_lines pl ON pl.id = di.protected_line_id
		JOIN users u ON u.id = pl.user_id
		WHERE dr.id = ?
	`).bind(registrationId).first<RegistrationContextRow>();
}

function assertUsableContext(
	row: RegistrationContextRow | null,
	allowedStatuses: DeviceRegistrationStatus[]
): asserts row is RegistrationContextRow {
	if (!row) {
		throw new SubscriberDeliveryError(
			"Device registration not found",
			"device_registration_not_found",
			404
		);
	}
	if (
		row.delivery_identity_status !== "active"
		|| row.account_status !== "active"
		|| row.account_record_status !== "active"
		|| row.setup_status !== "onboarding_complete"
		|| !allowedStatuses.includes(row.status)
	) {
		throw new SubscriberDeliveryError(
			"Device registration is not authorized",
			"device_registration_not_authorized",
			403
		);
	}
}

export async function authorizeDeviceRegistration(
	db: D1Database,
	userId: number,
	protectedLineId: number,
	phoneModelId: string,
	config: TelnyxSubscriberCredentialConfig
): Promise<AuthorizedDeviceRegistration> {
	const phoneModel = await db.prepare(`
		SELECT id FROM phone_models WHERE id = ? AND selectable = 1
	`).bind(phoneModelId).first<{ id: string }>();
	if (!phoneModel) {
		throw new SubscriberDeliveryError(
			"Selectable phone model not found",
			"phone_model_not_found",
			400
		);
	}

	const line = await db.prepare(`
		SELECT pl.id FROM protected_lines pl
		JOIN users u ON u.id = pl.user_id
		WHERE pl.id = ? AND pl.user_id = ?
			AND u.status = 'active' AND u.account_status = 'active'
			AND u.setup_status = 'onboarding_complete'
	`).bind(protectedLineId, userId).first<{ id: number }>();
	if (!line) {
		throw new SubscriberDeliveryError(
			"Protected line not found",
			"protected_line_not_found",
			404
		);
	}

	await db.prepare(`
		INSERT INTO delivery_identities (protected_line_id)
		VALUES (?)
		ON CONFLICT(protected_line_id) DO NOTHING
	`).bind(protectedLineId).run();
	const identity = await db.prepare(`
		SELECT id, status FROM delivery_identities WHERE protected_line_id = ?
	`).bind(protectedLineId).first<{ id: number; status: DeliveryIdentityStatus }>();
	if (!identity || identity.status !== "active") {
		throw new SubscriberDeliveryError(
			"Delivery identity is not active",
			"delivery_identity_inactive"
		);
	}

	const existing = await db.prepare(`
		SELECT id FROM device_registrations
		WHERE delivery_identity_id = ? AND status IN ('pending', 'active')
		LIMIT 1
	`).bind(identity.id).first<{ id: number }>();
	if (existing) {
		throw new SubscriberDeliveryError(
			"An authorized device registration already exists",
			"device_registration_exists"
		);
	}

	const deviceAuthenticator = createSessionToken();
	const authenticatorHash = await hashSessionToken(deviceAuthenticator);
	const providerCredential = await createTelnyxTelephonyCredential(
		config,
		`nmsc-device-${identity.id}-${Date.now()}`
	);
	try {
		const now = new Date().toISOString();
		const inserted = await db.prepare(`
			INSERT INTO device_registrations (
				delivery_identity_id, phone_model_id, status,
				provider_telephony_credential_id, provider_sip_username,
				provider_credential_expires_at, device_authenticator_hash,
				authorized_at, created_at, updated_at
			) VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)
		`).bind(
			identity.id,
			phoneModelId,
			providerCredential.id,
			providerCredential.sipUsername,
			providerCredential.expiresAt,
			authenticatorHash,
			now,
			now,
			now
		).run();
		const row = await db.prepare(`
			SELECT ${DEVICE_REGISTRATION_COLUMNS}
			FROM device_registrations WHERE id = ?
		`).bind(Number(inserted.meta.last_row_id)).first<DeviceRegistrationRow>();
		if (!row) throw new Error("Device registration insert was not readable");
		return { deviceRegistration: mapRegistration(row), deviceAuthenticator };
	} catch (error) {
		try {
			await deleteTelnyxTelephonyCredential(config, providerCredential.id);
		} catch {
			// Preserve the original storage failure; provider cleanup is best effort.
		}
		throw error;
	}
}

export async function issueDeviceTelnyxToken(
	db: D1Database,
	registrationId: number,
	config: TelnyxSubscriberCredentialConfig,
	authorization: { userId: number } | { deviceAuthenticator: string }
): Promise<TelnyxCredentialToken> {
	const row = await registrationContext(db, registrationId);
	assertUsableContext(row, ["pending", "active"]);
	if ("userId" in authorization) {
		if (row.protected_line_user_id !== authorization.userId) {
			throw new SubscriberDeliveryError("Device registration not found", "device_registration_not_found", 404);
		}
	} else {
		if (row.status !== "active") {
			throw new SubscriberDeliveryError("Device registration is not active", "device_registration_not_active", 403);
		}
		const suppliedHash = await hashSessionToken(authorization.deviceAuthenticator);
		if (suppliedHash !== row.device_authenticator_hash) {
			throw new SubscriberDeliveryError("Invalid device authenticator", "invalid_device_authenticator", 401);
		}
	}

	const provider = await retrieveTelnyxTelephonyCredential(
		config,
		row.provider_telephony_credential_id
	);
	if (
		provider.expired
		|| provider.id !== row.provider_telephony_credential_id
		|| provider.sipUsername !== row.provider_sip_username
	) {
		throw new SubscriberDeliveryError(
			"Provider credential is not valid",
			"provider_credential_invalid",
			409
		);
	}
	return createTelnyxCredentialToken(
		config,
		row.provider_telephony_credential_id
	);
}

export async function activateDeviceRegistration(
	db: D1Database,
	userId: number,
	registrationId: number,
	config: TelnyxSubscriberCredentialConfig
): Promise<DeviceRegistrationRecord> {
	const row = await registrationContext(db, registrationId);
	assertUsableContext(row, ["pending", "active"]);
	if (row.protected_line_user_id !== userId) {
		throw new SubscriberDeliveryError("Device registration not found", "device_registration_not_found", 404);
	}
	const verification = await checkTelnyxCredentialRegistration(
		config,
		row.provider_sip_username
	);
	if (!verification.registered) {
		throw new SubscriberDeliveryError(
			"Device is not registered with Telnyx",
			"provider_device_not_registered"
		);
	}
	const now = new Date().toISOString();
	await db.prepare(`
		UPDATE device_registrations
		SET status = 'active', activated_at = COALESCE(activated_at, ?),
			last_provider_verification_at = ?, updated_at = ?
		WHERE id = ? AND status IN ('pending', 'active')
	`).bind(now, now, now, registrationId).run();
	const updated = await db.prepare(`
		SELECT ${DEVICE_REGISTRATION_COLUMNS}
		FROM device_registrations WHERE id = ?
	`).bind(registrationId).first<DeviceRegistrationRow>();
	if (!updated) throw new Error("Activated device registration was not readable");
	return mapRegistration(updated);
}

export async function revokeDeviceRegistration(
	db: D1Database,
	userId: number,
	registrationId: number,
	config: TelnyxSubscriberCredentialConfig
): Promise<DeviceRegistrationRecord> {
	const row = await registrationContext(db, registrationId);
	if (!row || row.protected_line_user_id !== userId) {
		throw new SubscriberDeliveryError(
			"Device registration not found",
			"device_registration_not_found",
			404
		);
	}
	const revokedAt = row.revoked_at ?? new Date().toISOString();
	if (row.status !== "revoked") {
		await db.prepare(`
			UPDATE device_registrations
			SET status = 'revoked', revoked_at = ?, updated_at = ?
			WHERE id = ?
		`).bind(revokedAt, revokedAt, registrationId).run();
	}
	// Product authorization is removed before the provider call, so routing and
	// JWT renewal fail closed even if Telnyx deletion must be retried.
	await deleteTelnyxTelephonyCredential(
		config,
		row.provider_telephony_credential_id
	);
	const updated = await db.prepare(`
		SELECT ${DEVICE_REGISTRATION_COLUMNS}
		FROM device_registrations WHERE id = ?
	`).bind(registrationId).first<DeviceRegistrationRow>();
	if (!updated) throw new Error("Revoked device registration was not readable");
	return mapRegistration(updated);
}

export async function resolveActiveSubscriberDestination(
	db: D1Database,
	protectedLineId: number
): Promise<{ sipUsername: string } | null> {
	const rows = await db.prepare(`
		SELECT dr.provider_sip_username
		FROM delivery_identities di
		JOIN device_registrations dr ON dr.delivery_identity_id = di.id
		WHERE di.protected_line_id = ? AND di.status = 'active'
			AND dr.status = 'active'
	`).bind(protectedLineId).all<{ provider_sip_username: string }>();
	if (rows.results.length !== 1) return null;
	return { sipUsername: rows.results[0].provider_sip_username };
}
