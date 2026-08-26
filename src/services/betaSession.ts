import { hashSessionToken } from "../utils/sessionToken";
import type { UserRecord } from "./users";

interface SessionUserRow {
	session_id: number;
	expires_at: string;
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

export interface BetaSessionResult {
	expiresAt: string;
	user: UserRecord;
}

function mapSessionUserRow(row: SessionUserRow): UserRecord {
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

export async function authenticateBetaSession(
	db: D1Database,
	sessionToken: string
): Promise<BetaSessionResult | null> {
	const tokenHash = await hashSessionToken(sessionToken);
	const now = new Date().toISOString();

	const row = await db
		.prepare(`
			SELECT
				portal_sessions.id AS session_id,
				portal_sessions.expires_at,
				users.id,
				users.first_name,
				users.last_name,
				users.email,
				users.contact_phone_number,
				users.contact_method,
				users.sms_contact_number,
				users.sms_capable,
				users.role,
				users.account_status,
				users.setup_status,
				users.status
			FROM portal_sessions
			INNER JOIN users
				ON users.id = portal_sessions.user_id
			WHERE portal_sessions.token_hash = ?
				AND portal_sessions.revoked_at IS NULL
				AND portal_sessions.expires_at > ?
				AND users.role IN ('subscriber', 'participant', 'admin', 'administrator')
				AND users.account_status = 'active'
				AND users.status = 'active'
			LIMIT 1
		`)
		.bind(tokenHash, now)
		.first<SessionUserRow>();

	if (!row) {
		return null;
	}

	const update = await db
		.prepare(`
			UPDATE portal_sessions
			SET last_used_at = ?
			WHERE id = ?
				AND revoked_at IS NULL
		`)
		.bind(now, row.session_id)
		.run();

	if (update.meta.changes !== 1) {
		return null;
	}

	return {
		expiresAt: row.expires_at,
		user: mapSessionUserRow(row)
	};
}
