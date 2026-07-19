export interface RedeemedBetaInviteCode {
	id: number;
	code: string;
	status: string;
	maxUses: number;
	useCount: number;
	expiresAt: string | null;
}

interface BetaInviteCodeRow {
	id: number;
	code: string;
	status: string;
	max_uses: number;
	use_count: number;
	expires_at: string | null;
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
		expiresAt: row.expires_at
	};
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
				expires_at
			FROM beta_invite_codes
			WHERE code = ?
		`)
		.bind(normalizedCode)
		.first<BetaInviteCodeRow>();

	return row ? mapBetaInviteCodeRow(row) : null;
}
