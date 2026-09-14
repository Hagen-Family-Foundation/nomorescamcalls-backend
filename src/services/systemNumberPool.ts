export const SYSTEM_NUMBER_POOL_TAG = "nmsc-system-number-pool";
export const SYSTEM_NUMBER_REORDER_THRESHOLD = 5;
export const SYSTEM_NUMBER_REORDER_QUANTITY = 50;
export const SYSTEM_NUMBER_COUNTRY = "US";
export const SYSTEM_NUMBER_AREA_CODE = "913";
export const SYSTEM_NUMBER_TYPE = "local";
export const LEGACY_EXCLUDED_SYSTEM_NUMBER = "+19135858300";
export const WORKING_TEST_SYSTEM_NUMBER = "+19139562493";

export type SystemNumberLifecycleState =
	| "quarantined"
	| "ready"
	| "assigned"
	| "ineligible";

export type SystemNumberVerificationState =
	| "pending"
	| "verified"
	| "failed";

export interface SystemNumberRecord {
	id: number;
	providerNumberId: string | null;
	phoneNumber: string;
	lifecycleState: SystemNumberLifecycleState;
	protectedLineId: number | null;
	replenishmentId: number | null;
	availableSince: string | null;
	assignedAt: string | null;
	releasedAt: string | null;
	verificationState: SystemNumberVerificationState;
	lastVerifiedAt: string | null;
	verificationError: string | null;
	quarantineReason: string | null;
	createdAt: string;
	updatedAt: string;
}

interface SystemNumberRow {
	id: number;
	provider_number_id: string | null;
	phone_number: string;
	lifecycle_state: SystemNumberLifecycleState;
	protected_line_id: number | null;
	replenishment_id: number | null;
	available_since: string | null;
	assigned_at: string | null;
	released_at: string | null;
	verification_state: SystemNumberVerificationState;
	last_verified_at: string | null;
	verification_error: string | null;
	quarantine_reason: string | null;
	created_at: string;
	updated_at: string;
}

const SYSTEM_NUMBER_COLUMNS = `
	id,
	provider_number_id,
	phone_number,
	lifecycle_state,
	protected_line_id,
	replenishment_id,
	available_since,
	assigned_at,
	released_at,
	verification_state,
	last_verified_at,
	verification_error,
	quarantine_reason,
	created_at,
	updated_at
`;

function mapSystemNumber(row: SystemNumberRow): SystemNumberRecord {
		return {
		id: row.id,
		providerNumberId: row.provider_number_id,
		phoneNumber: row.phone_number,
		lifecycleState: row.lifecycle_state,
		protectedLineId: row.protected_line_id,
		replenishmentId: row.replenishment_id,
		availableSince: row.available_since,
		assignedAt: row.assigned_at,
		releasedAt: row.released_at,
		verificationState: row.verification_state,
		lastVerifiedAt: row.last_verified_at,
		verificationError: row.verification_error,
		quarantineReason: row.quarantine_reason,
		createdAt: row.created_at,
		updatedAt: row.updated_at
		};
}
export async function findSystemNumber(
	db: D1Database,
	phoneNumber: string
): Promise<SystemNumberRecord | null> {
	const row = await db.prepare(`
		SELECT ${SYSTEM_NUMBER_COLUMNS}
		FROM system_numbers
		WHERE phone_number = ?
	`).bind(phoneNumber).first<SystemNumberRow>();

	return row ? mapSystemNumber(row) : null;
}

export async function findSystemNumberByProviderId(
	db: D1Database,
	providerNumberId: string
): Promise<SystemNumberRecord | null> {
	const row = await db.prepare(`
		SELECT ${SYSTEM_NUMBER_COLUMNS}
		FROM system_numbers
		WHERE provider_number_id = ?
	`).bind(providerNumberId).first<SystemNumberRow>();

	return row ? mapSystemNumber(row) : null;
}

export async function listSystemNumbers(
	db: D1Database
): Promise<SystemNumberRecord[]> {
	const result = await db.prepare(`
		SELECT ${SYSTEM_NUMBER_COLUMNS}
		FROM system_numbers
		ORDER BY id ASC
	`).all<SystemNumberRow>();

	return result.results.map(mapSystemNumber);
}

export interface RegisterQuarantinedSystemNumberInput {
	providerNumberId: string;
	phoneNumber: string;
	replenishmentId?: number | null;
	reason?: string;
}

export async function registerQuarantinedSystemNumber(
	db: D1Database,
	input: RegisterQuarantinedSystemNumberInput
): Promise<SystemNumberRecord> {
	const phoneNumber = input.phoneNumber.trim();
	const providerNumberId = input.providerNumberId.trim();

	if (!phoneNumber || !providerNumberId) {
		throw new Error("System Number and Telnyx provider number ID are required");
	}
	if (phoneNumber === LEGACY_EXCLUDED_SYSTEM_NUMBER) {
		throw new Error("Legacy Scaminater number cannot enter the System Number Pool");
	}
	if (phoneNumber === WORKING_TEST_SYSTEM_NUMBER) {
		throw new Error("Working test number cannot enter the System Number Pool");
	}

	await db.prepare(`
		INSERT INTO system_numbers (
			provider_number_id,
			phone_number,
			lifecycle_state,
			replenishment_id,
			verification_state,
			quarantine_reason,
			updated_at
		)
		VALUES (?, ?, 'quarantined', ?, 'pending', ?, CURRENT_TIMESTAMP)
		ON CONFLICT(phone_number) DO UPDATE SET
			provider_number_id = excluded.provider_number_id,
			replenishment_id = COALESCE(
				system_numbers.replenishment_id,
				excluded.replenishment_id
			),
			updated_at = CURRENT_TIMESTAMP
		WHERE system_numbers.lifecycle_state != 'assigned'
	`).bind(
		providerNumberId,
		phoneNumber,
		input.replenishmentId ?? null,
		input.reason ?? "provider_verification_pending"
	).run();

	const record = await findSystemNumber(db, phoneNumber);
	if (!record) {
		throw new Error("Failed to register quarantined System Number");
	}
	return record;
}

export async function recordSystemNumberVerification(
	db: D1Database,
	phoneNumber: string,
	result: {
		verified: boolean;
		providerNumberId?: string | null;
		reason?: string | null;
		verifiedAt?: string;
	}
): Promise<SystemNumberRecord> {
	const verifiedAt = result.verifiedAt ?? new Date().toISOString();
	const update = await db.prepare(`
		UPDATE system_numbers
		SET provider_number_id = COALESCE(?, provider_number_id),
			verification_state = ?,
			last_verified_at = ?,
			verification_error = ?,
			quarantine_reason = CASE
				WHEN ? = 1 AND lifecycle_state = 'assigned' THEN NULL
				WHEN ? = 1 THEN quarantine_reason
				ELSE COALESCE(?, 'provider_verification_failed')
			END,
			lifecycle_state = CASE
				WHEN ? = 0 AND lifecycle_state = 'ready' THEN 'quarantined'
				ELSE lifecycle_state
			END,
			available_since = CASE
				WHEN ? = 0 AND lifecycle_state = 'ready' THEN NULL
				ELSE available_since
			END,
			updated_at = ?
		WHERE phone_number = ?
	`).bind(
		result.providerNumberId ?? null,
		result.verified ? "verified" : "failed",
		verifiedAt,
		result.verified ? null : result.reason ?? "provider_verification_failed",
		result.verified ? 1 : 0,
		result.verified ? 1 : 0,
		result.reason ?? null,
		result.verified ? 1 : 0,
		result.verified ? 1 : 0,
		verifiedAt,
		phoneNumber
	).run();

	if (update.meta.changes !== 1) {
		throw new Error("System Number was not found for provider verification");
	}

	return (await findSystemNumber(db, phoneNumber))!;
}

export async function promoteVerifiedSystemNumber(
	db: D1Database,
	phoneNumber: string,
	availableSince = new Date().toISOString()
): Promise<SystemNumberRecord> {
	if (
		phoneNumber === LEGACY_EXCLUDED_SYSTEM_NUMBER
		|| phoneNumber === WORKING_TEST_SYSTEM_NUMBER
	) {
		throw new Error("Excluded number cannot be promoted to the System Number Pool");
	}

	const result = await db.prepare(`
		UPDATE system_numbers
		SET lifecycle_state = 'ready',
			available_since = ?,
			assigned_at = NULL,
			released_at = NULL,
			quarantine_reason = NULL,
			verification_error = NULL,
			updated_at = ?
		WHERE phone_number = ?
			AND lifecycle_state = 'quarantined'
			AND protected_line_id IS NULL
			AND verification_state = 'verified'
			AND provider_number_id IS NOT NULL
			AND last_verified_at IS NOT NULL
	`).bind(availableSince, availableSince, phoneNumber).run();

	if (result.meta.changes !== 1) {
		throw new Error("System Number is not eligible for READY promotion");
	}

	return (await findSystemNumber(db, phoneNumber))!;
}

export async function assignOldestReadySystemNumber(
	db: D1Database,
	protectedLineId: number,
	assignedAt = new Date().toISOString()
): Promise<SystemNumberRecord> {
	const available = await db.prepare(`
		SELECT ${SYSTEM_NUMBER_COLUMNS}
		FROM system_numbers
		WHERE lifecycle_state = 'ready'
			AND protected_line_id IS NULL
			AND verification_state = 'verified'
		ORDER BY available_since ASC, id ASC
		LIMIT 1
	`).first<SystemNumberRow>();

	if (!available) {
		throw new Error("No READY System Numbers are available");
	}

	const result = await db.prepare(`
		UPDATE system_numbers
		SET lifecycle_state = 'assigned',
			protected_line_id = ?,
			assigned_at = ?,
			available_since = NULL,
			released_at = NULL,
			updated_at = ?
		WHERE id = ?
			AND lifecycle_state = 'ready'
			AND protected_line_id IS NULL
	`).bind(protectedLineId, assignedAt, assignedAt, available.id).run();

	if (result.meta.changes !== 1) {
		throw new Error("READY System Number was assigned concurrently");
	}

	return (await findSystemNumber(db, available.phone_number))!;
}

export async function releaseSystemNumberForProtectedLine(
	db: D1Database,
	protectedLineId: number,
	releasedAt = new Date().toISOString()
): Promise<void> {
	await db.prepare(`
		UPDATE system_numbers
		SET lifecycle_state = CASE
				WHEN verification_state = 'verified' THEN 'ready'
				ELSE 'quarantined'
			END,
			protected_line_id = NULL,
			available_since = CASE
				WHEN verification_state = 'verified' THEN ?
				ELSE NULL
			END,
			assigned_at = NULL,
			released_at = ?,
			quarantine_reason = CASE
				WHEN verification_state = 'verified' THEN NULL
				ELSE COALESCE(quarantine_reason, 'provider_verification_required')
			END,
			updated_at = ?
		WHERE protected_line_id = ?
			AND lifecycle_state = 'assigned'
	`).bind(releasedAt, releasedAt, releasedAt, protectedLineId).run();
}

export interface SystemNumberPoolHealth {
	total: number;
	ready: number;
	assigned: number;
	quarantined: number;
	ineligible: number;
	reorderThreshold: number;
	reorderRequired: boolean;
}

export async function getSystemNumberPoolHealth(
	db: D1Database
): Promise<SystemNumberPoolHealth> {
	const result = await db.prepare(`
		SELECT lifecycle_state, COUNT(*) AS count
		FROM system_numbers
		GROUP BY lifecycle_state
	`).all<{ lifecycle_state: SystemNumberLifecycleState; count: number }>();
	const counts = new Map(
		result.results.map((row) => [row.lifecycle_state, row.count])
	);
	const ready = counts.get("ready") ?? 0;

	return {
		total: [...counts.values()].reduce((sum, count) => sum + count, 0),
		ready,
		assigned: counts.get("assigned") ?? 0,
		quarantined: counts.get("quarantined") ?? 0,
		ineligible: counts.get("ineligible") ?? 0,
		reorderThreshold: SYSTEM_NUMBER_REORDER_THRESHOLD,
		reorderRequired: ready <= SYSTEM_NUMBER_REORDER_THRESHOLD
	};
}
