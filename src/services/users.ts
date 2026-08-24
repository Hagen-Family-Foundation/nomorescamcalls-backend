export interface UserRecord {
	id: number;
	firstName: string | null;
	lastName: string | null;
	callerFacingBusinessName: string | null;
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
	callerFacingBusinessName?: string | null;
	email?: string | null;
	phoneNumber: string;
	carrier?: string | null;
	contactMethod?: string | null;
	passwordHash?: string | null;
	role?: string;
}

export interface UpdateUserOnboardingInput {
	firstName?: string | null;
	lastName?: string | null;
	callerFacingBusinessName?: string | null;
	email?: string | null;
	phoneNumber?: string | null;
	carrier?: string | null;
	contactMethod?: string | null;
	passwordHash?: string | null;
}

interface UserRow {
	id: number;
	first_name: string | null;
	last_name: string | null;
	caller_facing_business_name: string | null;
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
	caller_facing_business_name,
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
		callerFacingBusinessName: row.caller_facing_business_name,
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
	const phoneNumber = input.phoneNumber.trim();
	const callerFacingBusinessName =
		input.callerFacingBusinessName?.trim() || null;

	if (!phoneNumber) {
		throw new Error("Subscriber phone number is required");
	}

	await db
		.prepare(`
			INSERT INTO users (
				first_name,
				last_name,
				caller_facing_business_name,
				email,
				phone_number,
				screening_number,
				sip_username,
				carrier,
				contact_method,
				password_hash,
				role,
				account_status,
				setup_status,
				status,
				coverage_status
			)
			VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?)
		`)
		.bind(
			input.firstName?.trim() || null,
			input.lastName?.trim() || null,
			callerFacingBusinessName,
			input.email?.trim().toLowerCase() || null,
			phoneNumber,
			input.carrier?.trim() || null,
			input.contactMethod?.trim() || null,
			input.passwordHash ?? null,
			input.role ?? "subscriber",
			"active",
			"onboarding_incomplete",
			"active",
			"inactive"
		)
		.run();

	const user = await findUserByPhoneNumber(db, phoneNumber);

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
				caller_facing_business_name = COALESCE(?, caller_facing_business_name),
				email = COALESCE(?, email),
				phone_number = COALESCE(?, phone_number),
				carrier = COALESCE(?, carrier),
				contact_method = COALESCE(?, contact_method),
				password_hash = COALESCE(?, password_hash)
			WHERE id = ?
				AND status = 'active'
				AND coverage_status <> 'active'
		`)
		.bind(
			input.firstName?.trim() || null,
			input.lastName?.trim() || null,
			input.callerFacingBusinessName?.trim() || null,
			input.email?.trim().toLowerCase() || null,
			input.phoneNumber?.trim() || null,
			input.carrier?.trim() || null,
			input.contactMethod?.trim() || null,
			input.passwordHash || null,
			userId
		)
		.run();

	if (result.meta.changes !== 1) {
		throw new Error(
			"Subscriber not found or onboarding is already provisioned"
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
			SET setup_status = ?,
				coverage_status = 'inactive'
			WHERE id = ?
				AND status = 'active'
				AND coverage_status <> 'active'
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
				setup_status = 'provisioned',
				coverage_status = 'active'
			WHERE id = ?
				AND status = 'active'
				AND coverage_status <> 'active'
				AND screening_number IS NULL
				AND sip_username IS NULL
				AND EXISTS (
					SELECT 1
					FROM screening_number_inventory
					WHERE phone_number = ?
						AND status = 'assigned'
						AND assigned_user_id = ?
				)
				AND EXISTS (
					SELECT 1
					FROM sip_credential_inventory
					WHERE sip_username = ?
						AND status = 'assigned'
						AND assigned_user_id = ?
				)
		`)
		.bind(
			screeningNumber,
			sipUsername,
			userId,
			screeningNumber,
			userId,
			sipUsername,
			userId
		)
		.run();

	const user = await findUserByIdIncludingInactive(db, userId);

	if (
		!user
		|| user.screeningNumber !== screeningNumber
		|| user.sipUsername !== sipUsername
		|| user.setupStatus !== "provisioned"
		|| user.status !== "active"
		|| user.coverageStatus !== "active"
	) {
		throw new Error(
			"Failed to assign subscriber provisioning resources"
		);
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
				AND coverage_status = 'active'
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
