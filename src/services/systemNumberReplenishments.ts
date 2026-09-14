import {
	SYSTEM_NUMBER_REORDER_QUANTITY,
	SYSTEM_NUMBER_REORDER_THRESHOLD
} from "./systemNumberPool";

export type SystemNumberReplenishmentStatus =
	| "ordering"
	| "submitting_order"
	| "fulfilling"
	| "submitting_configuration"
	| "configuring"
	| "verifying"
	| "finalizing"
	| "completed"
	| "partial"
	| "failed";

export interface SystemNumberReplenishmentRecord {
	id: number;
	requestKey: string;
	providerCustomerReference: string;
	providerOrderId: string | null;
	providerConfigurationJobId: string | null;
	status: SystemNumberReplenishmentStatus;
	requestedQuantity: number;
	readyCountAtTrigger: number;
	providerAllocatedCount: number;
	verifiedReadyCount: number;
	lastError: string | null;
	createdAt: string;
	submittedAt: string | null;
	completedAt: string | null;
	updatedAt: string;
}

interface ReplenishmentRow {
	id: number;
	request_key: string;
	provider_customer_reference: string;
	provider_order_id: string | null;
	provider_configuration_job_id: string | null;
	status: SystemNumberReplenishmentStatus;
	requested_quantity: number;
	ready_count_at_trigger: number;
	provider_allocated_count: number;
	verified_ready_count: number;
	last_error: string | null;
	created_at: string;
	submitted_at: string | null;
	completed_at: string | null;
	updated_at: string;
}

const COLUMNS = `
	id,
	request_key,
	provider_customer_reference,
	provider_order_id,
	provider_configuration_job_id,
	status,
	requested_quantity,
	ready_count_at_trigger,
	provider_allocated_count,
	verified_ready_count,
	last_error,
	created_at,
	submitted_at,
	completed_at,
	updated_at
`;

function mapReplenishment(row: ReplenishmentRow): SystemNumberReplenishmentRecord {
	return {
		id: row.id,
		requestKey: row.request_key,
		providerCustomerReference: row.provider_customer_reference,
		providerOrderId: row.provider_order_id,
		providerConfigurationJobId: row.provider_configuration_job_id,
		status: row.status,
		requestedQuantity: row.requested_quantity,
		readyCountAtTrigger: row.ready_count_at_trigger,
		providerAllocatedCount: row.provider_allocated_count,
		verifiedReadyCount: row.verified_ready_count,
		lastError: row.last_error,
		createdAt: row.created_at,
		submittedAt: row.submitted_at,
		completedAt: row.completed_at,
		updatedAt: row.updated_at
	};
}

export async function findInFlightSystemNumberReplenishment(
	db: D1Database
): Promise<SystemNumberReplenishmentRecord | null> {
	const row = await db.prepare(`
		SELECT ${COLUMNS}
		FROM system_number_replenishments
		WHERE in_flight_slot = 1
		LIMIT 1
	`).first<ReplenishmentRow>();
	return row ? mapReplenishment(row) : null;
}

export async function acquireSystemNumberReplenishment(
	db: D1Database,
	requestKey = crypto.randomUUID()
): Promise<SystemNumberReplenishmentRecord | null> {
	const customerReference = `nmsc-system-number-${requestKey}`;

	await db.prepare(`
		INSERT OR IGNORE INTO system_number_replenishments (
			request_key,
			provider_customer_reference,
			status,
			in_flight_slot,
			requested_quantity,
			ready_count_at_trigger
		)
		SELECT
			?,
			?,
			'ordering',
			1,
			?,
			COUNT(*)
		FROM system_numbers
		WHERE lifecycle_state = 'ready'
			AND protected_line_id IS NULL
			AND verification_state = 'verified'
		HAVING COUNT(*) <= ?
	`).bind(
		requestKey,
		customerReference,
		SYSTEM_NUMBER_REORDER_QUANTITY,
		SYSTEM_NUMBER_REORDER_THRESHOLD
	).run();

	const row = await db.prepare(`
		SELECT ${COLUMNS}
		FROM system_number_replenishments
		WHERE request_key = ?
	`).bind(requestKey).first<ReplenishmentRow>();

	return row ? mapReplenishment(row) : null;
}

export async function updateSystemNumberReplenishment(
	db: D1Database,
	id: number,
	input: {
		status: SystemNumberReplenishmentStatus;
		providerOrderId?: string | null;
		providerConfigurationJobId?: string | null;
		providerAllocatedCount?: number;
		verifiedReadyCount?: number;
		lastError?: string | null;
		submittedAt?: string | null;
	}
): Promise<SystemNumberReplenishmentRecord> {
	const terminal = new Set<SystemNumberReplenishmentStatus>([
		"completed",
		"partial",
		"failed"
	]).has(input.status);
	const now = new Date().toISOString();

	const result = await db.prepare(`
		UPDATE system_number_replenishments
		SET status = ?,
			provider_order_id = COALESCE(?, provider_order_id),
			provider_configuration_job_id = COALESCE(
				?,
				provider_configuration_job_id
			),
			provider_allocated_count = COALESCE(
				?,
				provider_allocated_count
			),
			verified_ready_count = COALESCE(
				?,
				verified_ready_count
			),
			last_error = ?,
			submitted_at = COALESCE(?, submitted_at),
			in_flight_slot = ?,
			completed_at = ?,
			updated_at = ?
		WHERE id = ?
	`).bind(
		input.status,
		input.providerOrderId ?? null,
		input.providerConfigurationJobId ?? null,
		input.providerAllocatedCount ?? null,
		input.verifiedReadyCount ?? null,
		input.lastError ?? null,
		input.submittedAt ?? null,
		terminal ? null : 1,
		terminal ? now : null,
		now,
		id
	).run();

	if (result.meta.changes !== 1) {
		throw new Error("System Number replenishment was not found");
	}

	const row = await db.prepare(`
		SELECT ${COLUMNS}
		FROM system_number_replenishments
		WHERE id = ?
	`).bind(id).first<ReplenishmentRow>();

	if (!row) {
		throw new Error("Failed to update System Number replenishment");
	}
	return mapReplenishment(row);
}

export async function claimSystemNumberReplenishmentStage(
	db: D1Database,
	id: number,
	expectedStatus: SystemNumberReplenishmentStatus,
	claimedStatus: SystemNumberReplenishmentStatus
): Promise<SystemNumberReplenishmentRecord | null> {
	const now = new Date().toISOString();
	const result = await db.prepare(`
		UPDATE system_number_replenishments
		SET status = ?,
			updated_at = ?
		WHERE id = ?
			AND status = ?
			AND in_flight_slot = 1
	`).bind(claimedStatus, now, id, expectedStatus).run();

	if (result.meta.changes !== 1) {
		return null;
	}
	const row = await db.prepare(`
		SELECT ${COLUMNS}
		FROM system_number_replenishments
		WHERE id = ?
	`).bind(id).first<ReplenishmentRow>();
	return row ? mapReplenishment(row) : null;
}
