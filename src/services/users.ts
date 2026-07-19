export interface UserRecord {
	id: number;
	firstName: string | null;
	lastName: string | null;
	email: string | null;
	phoneNumber: string;
	screeningNumber: string | null;
	sipUsername: string | null;
	carrier: string | null;
	contactMethod: string | null;
	role: string;
	accountStatus: string;
	setupStatus: string;
	status: string;
	coverageStatus: string;
}

export interface CreateUserInput {
	firstName?: string | null;
	lastName?: string | null;
	email?: string | null;
	phoneNumber: string;
	screeningNumber?: string | null;
	sipUsername?: string | null;
	carrier?: string | null;
	contactMethod?: string | null;
	role?: string;
	accountStatus?: string;
	setupStatus?: string;
	status?: string;
	coverageStatus?: string;
}

interface UserRow {
	id: number;
	first_name: string | null;
	last_name: string | null;
	email: string | null;
	phone_number: string;
	screening_number: string | null;
	sip_username: string | null;
	carrier: string | null;
	contact_method: string | null;
	role: string;
	account_status: string;
	setup_status: string;
	status: string;
	coverage_status: string;
}

const USER_COLUMNS = `
	id,
	first_name,
	last_name,
	email,
	phone_number,
	screening_number,
	sip_username,
	carrier,
	contact_method,
	role,
	account_status,
	setup_status,
	status,
	coverage_status
`;

function mapUserRow(row: UserRow): UserRecord {
	return {
		id: row.id,
		firstName: row.first_name,
		lastName: row.last_name,
		email: row.email,
		phoneNumber: row.phone_number,
		screeningNumber: row.screening_number,
		sipUsername: row.sip_username,
		carrier: row.carrier,
		contactMethod: row.contact_method,
		role: row.role,
		accountStatus: row.account_status,
		setupStatus: row.setup_status,
		status: row.status,
		coverageStatus: row.coverage_status
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
				first_name,
				last_name,
				email,
				phone_number,
				screening_number,
				sip_username,
				carrier,
				contact_method,
				role,
				account_status,
				setup_status,
				status,
				coverage_status
			)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(phone_number) DO UPDATE SET
				first_name = excluded.first_name,
				last_name = excluded.last_name,
				email = excluded.email,
				screening_number = excluded.screening_number,
				sip_username = excluded.sip_username,
				carrier = excluded.carrier,
				contact_method = excluded.contact_method,
				role = excluded.role,
				account_status = excluded.account_status,
				setup_status = excluded.setup_status,
				status = excluded.status,
				coverage_status = excluded.coverage_status
		`)
		.bind(
			input.firstName ?? null,
			input.lastName ?? null,
			input.email ?? null,
			input.phoneNumber,
			input.screeningNumber ?? null,
			input.sipUsername ?? null,
			input.carrier ?? null,
			input.contactMethod ?? null,
			input.role ?? "participant",
			input.accountStatus ?? "active",
			input.setupStatus ?? "account_created",
			status,
			coverageStatus
		)
		.run();

	const user = await findUserByPhoneNumber(db, input.phoneNumber);

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
			SELECT ${USER_COLUMNS}
			FROM users
			WHERE id = ?
				AND status = 'active'
		`)
		.bind(id)
		.first<UserRow>();

	return row ? mapUserRow(row) : null;
}

export async function findUserByPhoneNumber(
	db: D1Database,
	phoneNumber: string
): Promise<UserRecord | null> {
	const row = await db
		.prepare(`
			SELECT ${USER_COLUMNS}
			FROM users
			WHERE phone_number = ?
		`)
		.bind(phoneNumber)
		.first<UserRow>();

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
			SELECT ${USER_COLUMNS}
			FROM users
			WHERE id = ?
		`)
		.bind(id)
		.first<UserRow>();

	return row ? mapUserRow(row) : null;
}

export async function findUserByScreeningNumber(
	db: D1Database,
	screeningNumber: string
): Promise<UserRecord | null> {
	const row = await db
		.prepare(`
			SELECT ${USER_COLUMNS}
			FROM users
			WHERE screening_number = ?
				AND status = 'active'
		`)
		.bind(screeningNumber)
		.first<UserRow>();

	return row ? mapUserRow(row) : null;
}

export async function listUsers(
	db: D1Database,
	limit: number
): Promise<UserRecord[]> {
	const result = await db
		.prepare(`
			SELECT ${USER_COLUMNS}
			FROM users
			ORDER BY id DESC
			LIMIT ?
		`)
		.bind(limit)
		.all<UserRow>();

	return result.results.map(mapUserRow);
}
