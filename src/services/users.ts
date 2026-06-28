export interface UserRecord {
	id: number;
	fullName: string | null;
	email: string | null;
	phoneNumber: string;
	screeningNumber: string | null;
	sipUsername: string | null;
	status: string;
	coverageStatus: string;
}

export interface CreateUserInput {
	fullName?: string | null;
	email?: string | null;
	phoneNumber: string;
	screeningNumber?: string | null;
	sipUsername?: string | null;
	status?: string;
	coverageStatus?: string;
}

function mapUserRow(row: {
	id: number;
	full_name?: string | null;
	email?: string | null;
	phone_number: string;
	screening_number: string | null;
	sip_username: string | null;
	status: string;
	coverage_status?: string | null;
}): UserRecord {
	return {
		id: row.id,
		fullName: row.full_name ?? null,
		email: row.email ?? null,
		phoneNumber: row.phone_number,
		screeningNumber: row.screening_number,
		sipUsername: row.sip_username,
		status: row.status,
		coverageStatus: row.coverage_status ?? row.status
	};
}

export async function createUser(
	db: D1Database,
	input: CreateUserInput
): Promise<UserRecord> {
	const status = input.status ?? "active";
	const coverageStatus = input.coverageStatus ?? status;

	await db
		.prepare(`
			INSERT INTO users (
				full_name,
				email,
				phone_number,
				screening_number,
				sip_username,
				status,
				coverage_status
			)
			VALUES (?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(phone_number) DO UPDATE SET
				full_name = excluded.full_name,
				email = excluded.email,
				screening_number = excluded.screening_number,
				sip_username = excluded.sip_username,
				status = excluded.status,
				coverage_status = excluded.coverage_status
		`)
		.bind(
			input.fullName ?? null,
			input.email ?? null,
			input.phoneNumber,
			input.screeningNumber ?? null,
			input.sipUsername ?? null,
			status,
			coverageStatus
		)
		.run();

	const user = await findUserByPhoneNumber(
		db,
		input.phoneNumber
	);

	if (!user) {
		throw new Error("Failed to create or update user");
	}

	return user;
}

export async function findUserById(
	db: D1Database,
	id: number
): Promise<UserRecord | null> {
	const row = await db
		.prepare(`
			SELECT
				id,
				full_name,
				email,
				phone_number,
				screening_number,
				sip_username,
				status,
				coverage_status
			FROM users
			WHERE id = ?
				AND status = 'active'
		`)
		.bind(id)
		.first<{
			id: number;
			full_name: string | null;
			email: string | null;
			phone_number: string;
			screening_number: string | null;
			sip_username: string | null;
			status: string;
			coverage_status: string | null;
		}>();

	return row ? mapUserRow(row) : null;
}

export async function findUserByPhoneNumber(
	db: D1Database,
	phoneNumber: string
): Promise<UserRecord | null> {
	const row = await db
		.prepare(`
			SELECT
				id,
				full_name,
				email,
				phone_number,
				screening_number,
				sip_username,
				status,
				coverage_status
			FROM users
			WHERE phone_number = ?
		`)
		.bind(phoneNumber)
		.first<{
			id: number;
			full_name: string | null;
			email: string | null;
			phone_number: string;
			screening_number: string | null;
			sip_username: string | null;
			status: string;
			coverage_status: string | null;
		}>();

	return row ? mapUserRow(row) : null;
}

export async function updateUserProvisioningAssignment(
	db: D1Database,
	userId: number,
	screeningNumber: string,
	sipUsername: string
): Promise<UserRecord> {
	await db
		.prepare(`
			UPDATE users
			SET screening_number = ?,
				sip_username = ?,
				status = 'active',
				coverage_status = 'active'
			WHERE id = ?
				AND status = 'provisioning'
		`)
		.bind(screeningNumber, sipUsername, userId)
		.run();

	const user = await findUserByIdIncludingInactive(db, userId);

	if (
		!user
		|| user.screeningNumber !== screeningNumber
		|| user.sipUsername !== sipUsername
		|| user.status !== "active"
		|| user.coverageStatus !== "active"
	) {
		throw new Error("Failed to finalize provisioned user");
	}

	return user;
}

export async function deleteUserById(
	db: D1Database,
	userId: number
): Promise<void> {
	await db
		.prepare("DELETE FROM users WHERE id = ?")
		.bind(userId)
		.run();
}

async function findUserByIdIncludingInactive(
	db: D1Database,
	id: number
): Promise<UserRecord | null> {
	const row = await db
		.prepare(`
			SELECT
				id,
				full_name,
				email,
				phone_number,
				screening_number,
				sip_username,
				status,
				coverage_status
			FROM users
			WHERE id = ?
		`)
		.bind(id)
		.first<{
			id: number;
			full_name: string | null;
			email: string | null;
			phone_number: string;
			screening_number: string | null;
			sip_username: string | null;
			status: string;
			coverage_status: string | null;
		}>();

	return row ? mapUserRow(row) : null;
}

export async function findUserByScreeningNumber(
	db: D1Database,
	screeningNumber: string
): Promise<UserRecord | null> {
	const row = await db
		.prepare(`
			SELECT
				id,
				full_name,
				email,
				phone_number,
				screening_number,
				sip_username,
				status,
				coverage_status
			FROM users
			WHERE screening_number = ?
				AND status = 'active'
		`)
		.bind(screeningNumber)
		.first<{
			id: number;
			full_name: string | null;
			email: string | null;
			phone_number: string;
			screening_number: string | null;
			sip_username: string | null;
			status: string;
			coverage_status: string | null;
		}>();

	return row ? mapUserRow(row) : null;
}

export async function listUsers(
	db: D1Database,
	limit: number
): Promise<UserRecord[]> {
	const result = await db
		.prepare(`
			SELECT
				id,
				full_name,
				email,
				phone_number,
				screening_number,
				sip_username,
				status,
				coverage_status
			FROM users
			ORDER BY id DESC
			LIMIT ?
		`)
		.bind(limit)
		.all<{
			id: number;
			full_name: string | null;
			email: string | null;
			phone_number: string;
			screening_number: string | null;
			sip_username: string | null;
			status: string;
			coverage_status: string | null;
		}>();

	return result.results.map(mapUserRow);
}
