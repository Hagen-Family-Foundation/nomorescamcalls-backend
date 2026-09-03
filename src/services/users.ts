export interface UserRecord {
	id: number;
	firstName: string | null;
	lastName: string | null;
	email: string | null;
	contactPhoneNumber: string | null;
	contactMethod: string | null;
	smsContactNumber: string | null;
	smsCapable: boolean;
	role: string;
	accountStatus: string;
	setupStatus: string;
	status: string;
}

export interface CreateUserInput {
	firstName?: string | null;
	lastName?: string | null;
	email?: string | null;
	contactPhoneNumber: string;
	contactMethod?: string | null;
	smsContactNumber?: string | null;
	smsCapable?: boolean;
	passwordHash?: string | null;
	role?: string;
}

export interface UpdateUserOnboardingInput {
	firstName?: string | null;
	lastName?: string | null;
	email?: string | null;
	contactPhoneNumber?: string | null;
	contactMethod?: string | null;
	passwordHash?: string | null;
}

interface UserRow {
	id: number;
	first_name: string | null;
	last_name: string | null;
	email: string | null;
	contact_phone_number: string | null;
	contact_method: string | null;
	sms_contact_number: string | null;
	sms_capable: number;
	role: string;
	account_status: string;
	setup_status: string;
	status: string;
}

const USER_COLUMNS = `
	id,
	first_name,
	last_name,
	email,
	contact_phone_number,
	contact_method,
	sms_contact_number,
	sms_capable,
	role,
	account_status,
	setup_status,
	status
`;

function mapUserRow(row: UserRow): UserRecord {
	return {
		id: row.id,
		firstName: row.first_name,
		lastName: row.last_name,
		email: row.email,
		contactPhoneNumber: row.contact_phone_number,
		contactMethod: row.contact_method,
		smsContactNumber: row.sms_contact_number,
		smsCapable: row.sms_capable === 1,
		role: row.role,
		accountStatus: row.account_status,
		setupStatus: row.setup_status,
		status: row.status
	};
}

export async function createUser(
	db: D1Database,
	input: CreateUserInput
): Promise<UserRecord> {
	const contactPhoneNumber = input.contactPhoneNumber.trim();
	const smsContactNumber = input.smsContactNumber?.trim() || null;
	const role = input.role ?? "subscriber";
	const setupStatus = new Set(["admin", "administrator"]).has(role)
		? "administratively_ready"
		: "onboarding_incomplete";

	if (!contactPhoneNumber) {
		throw new Error("Account contact phone number is required");
	}
	if (input.smsCapable && !smsContactNumber) {
		throw new Error(
			"Explicit SMS capability requires an SMS contact number"
		);
	}

	const result = await db
		.prepare(`
			INSERT INTO users (
				first_name,
				last_name,
				caller_facing_business_name,
				email,
				contact_phone_number,
				phone_number,
				screening_number,
				sip_username,
				carrier,
				contact_method,
				sms_contact_number,
				sms_capable,
				password_hash,
				role,
				account_status,
				setup_status,
				status,
				coverage_status
			)
			VALUES (?, ?, NULL, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`)
		.bind(
			input.firstName?.trim() || null,
			input.lastName?.trim() || null,
			input.email?.trim().toLowerCase() || null,
			contactPhoneNumber,
			contactPhoneNumber,
			input.contactMethod?.trim() || null,
			smsContactNumber,
			input.smsCapable ? 1 : 0,
			input.passwordHash ?? null,
			role,
			"active",
			setupStatus,
			"active",
			"inactive"
		)
		.run();

	const user = await findUserByIdIncludingInactive(
		db,
		Number(result.meta.last_row_id)
	);

	if (!user) {
		throw new Error("Failed to create subscriber");
	}

	return user;
}

export async function updateUserOnboardingInformation(
	db: D1Database,
	userId: number,
	input: UpdateUserOnboardingInput
): Promise<UserRecord> {
	const result = await db
		.prepare(`
			UPDATE users
			SET first_name = COALESCE(?, first_name),
				last_name = COALESCE(?, last_name),
				email = COALESCE(?, email),
				contact_phone_number = COALESCE(?, contact_phone_number),
				contact_method = COALESCE(?, contact_method),
				password_hash = COALESCE(?, password_hash)
			WHERE id = ?
				AND status = 'active'
		`)
		.bind(
			input.firstName?.trim() || null,
			input.lastName?.trim() || null,
			input.email?.trim().toLowerCase() || null,
			input.contactPhoneNumber?.trim() || null,
			input.contactMethod?.trim() || null,
			input.passwordHash || null,
			userId
		)
		.run();

	if (result.meta.changes !== 1) {
		throw new Error(
			"Subscriber account not found"
		);
	}

	const user = await findUserById(db, userId);

	if (!user) {
		throw new Error("Failed to update subscriber onboarding");
	}

	return user;
}

export async function updateUserOnboardingState(
	db: D1Database,
	userId: number,
	setupStatus: "onboarding_incomplete" | "onboarding_complete"
): Promise<void> {
	await db
		.prepare(`
			UPDATE users
			SET setup_status = ?
			WHERE id = ?
				AND status = 'active'
		`)
		.bind(setupStatus, userId)
		.run();
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

export async function findUserByEmail(
	db: D1Database,
	email: string
): Promise<UserRecord | null> {
	const row = await db
		.prepare(`
			SELECT ${USER_COLUMNS}
			FROM users
			WHERE email = ?
		`)
		.bind(email.trim().toLowerCase())
		.first<UserRow>();

	return row ? mapUserRow(row) : null;
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

export async function findUserByIdIncludingInactive(
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
