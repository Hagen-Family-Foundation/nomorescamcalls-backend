export interface UserRecord {
	id: number;
	phoneNumber: string;
	screeningNumber: string | null;
	appIdentity: string | null;
	status: string;
}

export interface CreateUserInput {
	phoneNumber: string;
	screeningNumber?: string | null;
	appIdentity?: string | null;
	status?: string;
}

function mapUserRow(row: {
	id: number;
	phone_number: string;
	screening_number: string | null;
	app_identity: string | null;
	status: string;
}): UserRecord {
	return {
		id: row.id,
		phoneNumber: row.phone_number,
		screeningNumber: row.screening_number,
		appIdentity: row.app_identity,
		status: row.status
	};
}

export async function createUser(
	db: D1Database,
	input: CreateUserInput
): Promise<UserRecord> {
	const status = input.status ?? "active";

	await db
		.prepare(`
			INSERT INTO users (
				phone_number,
				screening_number,
				app_identity,
				status
			)
			VALUES (?, ?, ?, ?)
			ON CONFLICT(phone_number) DO UPDATE SET
				screening_number = excluded.screening_number,
				app_identity = excluded.app_identity,
				status = excluded.status
		`)
		.bind(
			input.phoneNumber,
			input.screeningNumber ?? null,
			input.appIdentity ?? null,
			status
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

export async function findUserByPhoneNumber(
	db: D1Database,
	phoneNumber: string
): Promise<UserRecord | null> {
	const row = await db
		.prepare(`
			SELECT
				id,
				phone_number,
				screening_number,
				app_identity,
				status
			FROM users
			WHERE phone_number = ?
		`)
		.bind(phoneNumber)
		.first<{
			id: number;
			phone_number: string;
			screening_number: string | null;
			app_identity: string | null;
			status: string;
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
				phone_number,
				screening_number,
				app_identity,
				status
			FROM users
			WHERE screening_number = ?
				AND status = 'active'
		`)
		.bind(screeningNumber)
		.first<{
			id: number;
			phone_number: string;
			screening_number: string | null;
			app_identity: string | null;
			status: string;
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
				phone_number,
				screening_number,
				app_identity,
				status
			FROM users
			ORDER BY id DESC
			LIMIT ?
		`)
		.bind(limit)
		.all<{
			id: number;
			phone_number: string;
			screening_number: string | null;
			app_identity: string | null;
			status: string;
		}>();

	return result.results.map(mapUserRow);
}
