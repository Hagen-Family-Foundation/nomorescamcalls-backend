			export interface BetaAgreementRecord {
	version: string;
	title: string;
	contentHash: string;
	effectiveAt: string;
}

export interface BetaAgreementAcceptanceResult {
	agreement: BetaAgreementRecord;
	acceptedAt: string;
}

interface BetaAgreementRow {
	version: string;
	title: string;
	content_hash: string;
	effective_at: string;
}

interface BetaAgreementAcceptanceRow {
	accepted_at: string;
}

function mapBetaAgreementRow(
	row: BetaAgreementRow
): BetaAgreementRecord {
	return {
		version: row.version,
		title: row.title,
		contentHash: row.content_hash,
		effectiveAt: row.effective_at
	};
}

export async function getCurrentBetaAgreement(
	db: D1Database
): Promise<BetaAgreementRecord | null> {
	const row = await db
		.prepare(`
			SELECT
				version,
				title,
				content_hash,
				effective_at
			FROM beta_agreements
			WHERE active = 1
			LIMIT 1
		`)
		.first<BetaAgreementRow>();

	return row ? mapBetaAgreementRow(row) : null;
}

export async function hasAcceptedCurrentBetaAgreement(
	db: D1Database,
	userId: number
): Promise<boolean> {
	const row = await db
		.prepare(`
			SELECT beta_agreement_acceptances.id
			FROM beta_agreement_acceptances
			INNER JOIN beta_agreements
				ON beta_agreements.version =
					beta_agreement_acceptances.agreement_version
			WHERE beta_agreement_acceptances.user_id = ?
				AND beta_agreements.active = 1
			LIMIT 1
		`)
		.bind(userId)
		.first<{ id: number }>();

	return row !== null;
}

export async function acceptCurrentBetaAgreement(
	db: D1Database,
	userId: number
): Promise<BetaAgreementAcceptanceResult | null> {
	const agreement = await getCurrentBetaAgreement(db);

	if (!agreement) {
		return null;
	}

	const acceptedAt = new Date().toISOString();

	await db
		.prepare(`
			INSERT OR IGNORE INTO beta_agreement_acceptances (
				user_id,
				agreement_version,
				accepted_at
			)
			VALUES (?, ?, ?)
		`)
		.bind(
			userId,
			agreement.version,
			acceptedAt
		)
		.run();

	const acceptance = await db
		.prepare(`
			SELECT accepted_at
			FROM beta_agreement_acceptances
			WHERE user_id = ?
				AND agreement_version = ?
			LIMIT 1
		`)
		.bind(
			userId,
			agreement.version
		)
		.first<BetaAgreementAcceptanceRow>();

	if (!acceptance) {
		throw new Error("Failed to record beta agreement acceptance");
	}

	return {
		agreement,
		acceptedAt: acceptance.accepted_at
	};
}