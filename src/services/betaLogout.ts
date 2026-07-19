import { hashSessionToken } from "../utils/sessionToken";

export async function logoutBetaParticipant(
	db: D1Database,
	sessionToken: string
): Promise<boolean> {
	const tokenHash = await hashSessionToken(sessionToken);
	const now = new Date().toISOString();

	const result = await db
		.prepare(`
			UPDATE portal_sessions
			SET revoked_at = ?
			WHERE token_hash = ?
				AND revoked_at IS NULL
				AND expires_at > ?
		`)
		.bind(now, tokenHash, now)
		.run();

	return result.meta.changes === 1;
}
