import { verifyPassword } from "../utils/passwordHash";
import {
	createSessionToken,
	hashSessionToken
} from "../utils/sessionToken";
import type { UserRecord } from "./users";

const SESSION_DURATION_MILLISECONDS = 24 * 60 * 60 * 1000;

interface LoginUserRow {
	id: number;
	first_name: string | null;
	last_name: string | null;
	email: string | null;
	phone_number: string;
	screening_number: string | null;
	sip_username: string | null;
	carrier: string | null;
	contact_method: string | null;
	password_hash: string | null;
	role: string;
	account_status: string;
	setup_status: string;
	status: string;
	coverage_status: string;
}

export interface BetaLoginResult {
	sessionToken: string;
	expiresAt: string;
	user: UserRecord;
}

function mapLoginUserRow(row: LoginUserRow): UserRecord {
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

export async function loginBetaParticipant(
	db: D1Database,
	email: string,
	password: string
): Promise<BetaLoginResult | null> {
	const normalizedEmail = email.trim().toLowerCase();

	const userRow = await db
		.prepare(`
			SELECT
				id,
				first_name,
				last_name,
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
			FROM users
			WHERE email = ?
				AND role IN ('participant', 'admin', 'administrator')
				AND account_status = 'active'
				AND status = 'active'
		`)
		.bind(normalizedEmail)
		.first<LoginUserRow>();

	if (
		!userRow
		|| !userRow.password_hash
		|| !(await verifyPassword(password, userRow.password_hash))
	) {
		return null;
	}

	const sessionToken = createSessionToken();
	const tokenHash = await hashSessionToken(sessionToken);
	const now = new Date();
	const expiresAt = new Date(
		now.getTime() + SESSION_DURATION_MILLISECONDS
	).toISOString();

	const insert = await db
		.prepare(`
			INSERT INTO portal_sessions (
				user_id,
				token_hash,
				expires_at,
				last_used_at
			)
			VALUES (?, ?, ?, ?)
		`)
		.bind(
			userRow.id,
			tokenHash,
			expiresAt,
			now.toISOString()
		)
		.run();

	if (insert.meta.changes !== 1) {
		throw new Error("Failed to create portal session");
	}

	return {
		sessionToken,
		expiresAt,
		user: mapLoginUserRow(userRow)
	};
}
