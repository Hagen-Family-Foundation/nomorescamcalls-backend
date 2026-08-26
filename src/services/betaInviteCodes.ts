export interface RedeemedBetaInviteCode {
	id: number;
	code: string;
	status: string;
	maxUses: number;
	useCount: number;
	expiresAt: string | null;
	invitationId: number;
}

interface BetaInviteCodeRow {
	id: number;
	code: string;
	status: string;
	max_uses: number;
	use_count: number;
	expires_at: string | null;
	invitation_id: number;
}

function mapBetaInviteCodeRow(
	row: BetaInviteCodeRow
): RedeemedBetaInviteCode {
	return {
		id: row.id,
		code: row.code,
		status: row.status,
		maxUses: row.max_uses,
		useCount: row.use_count,
		expiresAt: row.expires_at,
		invitationId: row.invitation_id
	};
}


export async function validateBetaInviteCode(
	db: D1Database,
	code: string
): Promise<RedeemedBetaInviteCode | null> {
	const normalizedCode = code.trim();
	const now = new Date().toISOString();

	if (!normalizedCode) {
		return null;
	}

	const row = await db
		.prepare(`
			SELECT
				beta_invite_codes.id,
				beta_invite_codes.code,
				beta_invite_codes.status,
				beta_invite_codes.max_uses,
				beta_invite_codes.use_count,
				beta_invite_codes.expires_at,
				beta_invite_codes.invitation_id
			FROM beta_invite_codes
			INNER JOIN beta_invitations
				ON beta_invitations.id = beta_invite_codes.invitation_id
			WHERE beta_invite_codes.code = ?
				AND beta_invite_codes.status = 'active'
				AND beta_invite_codes.use_count < beta_invite_codes.max_uses
				AND beta_invite_codes.redeemed_by_user_id IS NULL
				AND beta_invitations.status = 'credential_issued'
				AND (
					beta_invite_codes.expires_at IS NULL
					OR beta_invite_codes.expires_at > ?
				)
			LIMIT 1
		`)
		.bind(normalizedCode, now)
		.first<BetaInviteCodeRow>();

	return row ? mapBetaInviteCodeRow(row) : null;
}

export async function redeemBetaInviteCode(
	db: D1Database,
	code: string
): Promise<RedeemedBetaInviteCode | null> {
	const normalizedCode = code.trim();
	const now = new Date().toISOString();

	if (!normalizedCode) {
		return null;
	}

	const update = await db
		.prepare(`
			UPDATE beta_invite_codes
			SET use_count = use_count + 1,
				status = CASE
					WHEN use_count + 1 >= max_uses THEN 'used'
					ELSE status
				END,
				updated_at = ?
			WHERE code = ?
				AND status = 'active'
				AND use_count < max_uses
				AND redeemed_by_user_id IS NULL
				AND invitation_id IS NOT NULL
				AND EXISTS (
					SELECT 1
					FROM beta_invitations
					WHERE beta_invitations.id = beta_invite_codes.invitation_id
						AND beta_invitations.status = 'credential_issued'
				)
				AND (
					expires_at IS NULL
					OR expires_at > ?
				)
		`)
		.bind(
			now,
			normalizedCode,
			now
		)
		.run();

	if (update.meta.changes !== 1) {
		return null;
	}

	const row = await db
		.prepare(`
			SELECT
				id,
				code,
				status,
				max_uses,
				use_count,
				expires_at,
				invitation_id
			FROM beta_invite_codes
			WHERE code = ?
		`)
		.bind(normalizedCode)
		.first<BetaInviteCodeRow>();

	return row ? mapBetaInviteCodeRow(row) : null;
}
