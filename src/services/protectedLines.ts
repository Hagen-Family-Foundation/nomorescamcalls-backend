import {
	findUserById,
	type UserRecord
} from "./users";

export const MAX_PROTECTED_LINES_PER_LOCATION = 6;

export interface AccountLocationRecord {
	id: number;
	userId: number;
	createdAt: string;
}

export interface ProtectedLineRecord {
	id: number;
	userId: number;
	locationId: number;
	protectedPhoneNumber: string;
	callerFacingBusinessName: string;
	carrier: string | null;
	screeningNumber: string | null;
	sipUsername: string | null;
	provisioningStatus: "unprovisioned" | "provisioned" | "failed";
	coverageStatus: "inactive" | "active";
	createdAt: string;
	updatedAt: string;
}

export interface ProtectedLineWithAccount {
	protectedLine: ProtectedLineRecord;
	account: UserRecord;
}

export interface CreateProtectedLineInput {
	protectedPhoneNumber: string;
	callerFacingBusinessName: string;
	carrier?: string | null;
}

interface LocationRow {
	id: number;
	user_id: number;
	created_at: string;
}

interface ProtectedLineRow {
	id: number;
	user_id: number;
	location_id: number;
	protected_phone_number: string;
	caller_facing_business_name: string;
	carrier: string | null;
	screening_number: string | null;
	sip_username: string | null;
	provisioning_status: "unprovisioned" | "provisioned" | "failed";
	coverage_status: "inactive" | "active";
	created_at: string;
	updated_at: string;
}

const PROTECTED_LINE_COLUMNS = `
	id,
	user_id,
	location_id,
	protected_phone_number,
	caller_facing_business_name,
	carrier,
	screening_number,
	sip_username,
	provisioning_status,
	coverage_status,
	created_at,
	updated_at
`;

function mapLocationRow(row: LocationRow): AccountLocationRecord {
	return {
		id: row.id,
		userId: row.user_id,
		createdAt: row.created_at
	};
}

function mapProtectedLineRow(row: ProtectedLineRow): ProtectedLineRecord {
	return {
		id: row.id,
		userId: row.user_id,
		locationId: row.location_id,
		protectedPhoneNumber: row.protected_phone_number,
		callerFacingBusinessName: row.caller_facing_business_name,
		carrier: row.carrier,
		screeningNumber: row.screening_number,
		sipUsername: row.sip_username,
		provisioningStatus: row.provisioning_status,
		coverageStatus: row.coverage_status,
		createdAt: row.created_at,
		updatedAt: row.updated_at
	};
}

export class ProtectedLineError extends Error {
	constructor(
		message: string,
		readonly code: string
	) {
		super(message);
		this.name = "ProtectedLineError";
	}
}

export async function createAccountLocation(
	db: D1Database,
	userId: number
): Promise<AccountLocationRecord> {
	const result = await db
		.prepare(`
			INSERT INTO account_locations (user_id)
			SELECT id
			FROM users
			WHERE id = ?
				AND status = 'active'
				AND account_status = 'active'
		`)
		.bind(userId)
		.run();

	if (result.meta.changes !== 1) {
		throw new ProtectedLineError(
			"Customer account not found",
			"account_not_found"
		);
	}

	const row = await db
		.prepare(`
			SELECT id, user_id, created_at
			FROM account_locations
			WHERE id = ?
				AND user_id = ?
		`)
		.bind(Number(result.meta.last_row_id), userId)
		.first<LocationRow>();

	if (!row) {
		throw new Error("Failed to create account location");
	}

	return mapLocationRow(row);
}

export async function findAccountLocationById(
	db: D1Database,
	locationId: number
): Promise<AccountLocationRecord | null> {
	const row = await db
		.prepare(`
			SELECT id, user_id, created_at
			FROM account_locations
			WHERE id = ?
		`)
		.bind(locationId)
		.first<LocationRow>();

	return row ? mapLocationRow(row) : null;
}

export async function listAccountLocations(
	db: D1Database,
	userId: number
): Promise<AccountLocationRecord[]> {
	const result = await db
		.prepare(`
			SELECT id, user_id, created_at
			FROM account_locations
			WHERE user_id = ?
			ORDER BY id ASC
		`)
		.bind(userId)
		.all<LocationRow>();

	return result.results.map(mapLocationRow);
}

export async function createProtectedLine(
	db: D1Database,
	userId: number,
	locationId: number,
	input: CreateProtectedLineInput
): Promise<ProtectedLineRecord> {
	const protectedPhoneNumber = input.protectedPhoneNumber.trim();
	const callerFacingBusinessName = input.callerFacingBusinessName.trim();

	if (!protectedPhoneNumber) {
		throw new ProtectedLineError(
			"Protected phone number is required",
			"protected_phone_number_required"
		);
	}

	if (!callerFacingBusinessName) {
		throw new ProtectedLineError(
			"Caller-facing spoken identity is required",
			"caller_facing_business_name_required"
		);
	}

	try {
		const result = await db
			.prepare(`
				INSERT INTO protected_lines (
					user_id,
					location_id,
					protected_phone_number,
					caller_facing_business_name,
					carrier,
					provisioning_status,
					coverage_status
				)
				SELECT
					account_locations.user_id,
					account_locations.id,
					?,
					?,
					?,
					'unprovisioned',
					'inactive'
				FROM account_locations
				INNER JOIN users
					ON users.id = account_locations.user_id
				WHERE account_locations.id = ?
					AND account_locations.user_id = ?
					AND users.status = 'active'
					AND users.account_status = 'active'
					AND (
						SELECT COUNT(*)
						FROM protected_lines
						WHERE protected_lines.location_id = account_locations.id
					) < ?
			`)
			.bind(
				protectedPhoneNumber,
				callerFacingBusinessName,
				input.carrier?.trim() || null,
				locationId,
				userId,
				MAX_PROTECTED_LINES_PER_LOCATION
			)
			.run();

		if (result.meta.changes !== 1) {
			const location = await findAccountLocationById(db, locationId);

			if (!location || location.userId !== userId) {
				throw new ProtectedLineError(
					"Location does not belong to the customer account",
					"location_not_found"
				);
			}

			throw new ProtectedLineError(
				`A location may contain at most ${MAX_PROTECTED_LINES_PER_LOCATION} protected lines`,
				"location_line_limit_reached"
			);
		}
	} catch (error) {
		if (
			error instanceof ProtectedLineError
			|| !(error instanceof Error)
		) {
			throw error;
		}

		if (/UNIQUE constraint failed: protected_lines\.protected_phone_number/i.test(error.message)) {
			throw new ProtectedLineError(
				"Protected phone number already exists",
				"duplicate_protected_phone_number"
			);
		}

		throw error;
	}

	const line = await findProtectedLineByPhoneNumber(
		db,
		protectedPhoneNumber
	);

	if (!line || line.userId !== userId || line.locationId !== locationId) {
		throw new Error("Failed to create protected line");
	}

	return line;
}

export async function findProtectedLineById(
	db: D1Database,
	lineId: number
): Promise<ProtectedLineRecord | null> {
	const row = await db
		.prepare(`
			SELECT ${PROTECTED_LINE_COLUMNS}
			FROM protected_lines
			WHERE id = ?
		`)
		.bind(lineId)
		.first<ProtectedLineRow>();

	return row ? mapProtectedLineRow(row) : null;
}

export async function findProtectedLineByPhoneNumber(
	db: D1Database,
	protectedPhoneNumber: string
): Promise<ProtectedLineRecord | null> {
	const row = await db
		.prepare(`
			SELECT ${PROTECTED_LINE_COLUMNS}
			FROM protected_lines
			WHERE protected_phone_number = ?
		`)
		.bind(protectedPhoneNumber)
		.first<ProtectedLineRow>();

	return row ? mapProtectedLineRow(row) : null;
}

export async function listProtectedLinesForAccount(
	db: D1Database,
	userId: number
): Promise<ProtectedLineRecord[]> {
	const result = await db
		.prepare(`
			SELECT ${PROTECTED_LINE_COLUMNS}
			FROM protected_lines
			WHERE user_id = ?
			ORDER BY location_id ASC, id ASC
		`)
		.bind(userId)
		.all<ProtectedLineRow>();

	return result.results.map(mapProtectedLineRow);
}

export async function findProtectedLineByScreeningNumber(
	db: D1Database,
	screeningNumber: string
): Promise<ProtectedLineWithAccount | null> {
	const row = await db
		.prepare(`
			SELECT ${PROTECTED_LINE_COLUMNS}
			FROM protected_lines
			WHERE screening_number = ?
				AND provisioning_status = 'provisioned'
				AND coverage_status = 'active'
				AND EXISTS (
					SELECT 1
					FROM users
					WHERE users.id = protected_lines.user_id
						AND users.status = 'active'
						AND users.account_status = 'active'
				)
		`)
		.bind(screeningNumber)
		.first<ProtectedLineRow>();

	if (!row) {
		return null;
	}

	const protectedLine = mapProtectedLineRow(row);
	const account = await findUserById(db, protectedLine.userId);

	return account ? { protectedLine, account } : null;
}

export async function assignProtectedLineResources(
	db: D1Database,
	lineId: number,
	screeningNumber: string,
	sipUsername: string
): Promise<ProtectedLineRecord> {
	await db
		.prepare(`
			UPDATE protected_lines
			SET screening_number = ?,
				sip_username = ?,
				provisioning_status = 'provisioned',
				coverage_status = 'active',
				updated_at = CURRENT_TIMESTAMP
			WHERE id = ?
				AND coverage_status = 'inactive'
				AND screening_number IS NULL
				AND sip_username IS NULL
				AND EXISTS (
					SELECT 1
					FROM screening_number_inventory
					WHERE phone_number = ?
						AND status = 'assigned'
						AND assigned_protected_line_id = ?
				)
				AND EXISTS (
					SELECT 1
					FROM sip_credential_inventory
					WHERE sip_username = ?
						AND status = 'assigned'
						AND assigned_protected_line_id = ?
				)
		`)
		.bind(
			screeningNumber,
			sipUsername,
			lineId,
			screeningNumber,
			lineId,
			sipUsername,
			lineId
		)
		.run();

	const line = await findProtectedLineById(db, lineId);

	if (
		!line
		|| line.screeningNumber !== screeningNumber
		|| line.sipUsername !== sipUsername
		|| line.provisioningStatus !== "provisioned"
		|| line.coverageStatus !== "active"
	) {
		throw new Error("Failed to assign protected-line provisioning resources");
	}

	return line;
}

export async function markProtectedLineProvisioningFailed(
	db: D1Database,
	lineId: number
): Promise<void> {
	await db
		.prepare(`
			UPDATE protected_lines
			SET provisioning_status = 'failed',
				coverage_status = 'inactive',
				updated_at = CURRENT_TIMESTAMP
			WHERE id = ?
				AND coverage_status = 'inactive'
		`)
		.bind(lineId)
		.run();
}
