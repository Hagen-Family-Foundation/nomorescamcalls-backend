import { hashSessionToken } from "../utils/sessionToken";
import type { UserRecord } from "./users";

interface SessionUserRow {
	session_id: number;
	expires_at: string;
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
				users.phone_number,
				users.screening_number,
				users.sip_username,
				users.carrier,
				users.contact_method,
				users.role,
				users.account_status,
				users.setup_status,
				users.status,
				users.coverage_status
			FROM portal_sessions
			INNER JOIN users
				ON users.id = portal_sessions.user_id
			WHERE portal_sessions.token_hash = ?
				AND portal_sessions.revoked_at IS NULL
				AND portal_sessions.expires_at > ?
				AND users.role IN ('participant', 'admin', 'administrator')
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
