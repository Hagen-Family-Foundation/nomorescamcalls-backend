export interface SipCredentialInventoryRecord {
	id: number;
	sipUsername: string;
	status: string;
	assignedUserId: number | null;
	assignedAt: string | null;
	provider: string;
	providerCredentialId: string | null;
	connectionId: string | null;
	lastSyncedAt: string | null;
}

function mapSipCredentialInventoryRow(row: {
	id: number;
	sip_username: string;
	status: string;
	assigned_user_id: number | null;
	assigned_at: string | null;
	provider?: string | null;
	provider_credential_id?: string | null;
	connection_id?: string | null;
	last_synced_at?: string | null;
}): SipCredentialInventoryRecord {
	return {
		id: row.id,
		sipUsername: row.sip_username,
		status: row.status,
		assignedUserId: row.assigned_user_id,
		assignedAt: row.assigned_at,
		provider: row.provider ?? "telnyx",
		providerCredentialId: row.provider_credential_id ?? null,
		connectionId: row.connection_id ?? null,
		lastSyncedAt: row.last_synced_at ?? null
	};
}

export interface AddSipCredentialToInventoryInput {
	sipUsername: string;
	provider?: string;
	providerCredentialId?: string | null;
	connectionId?: string | null;
}

export async function addSipCredentialToInventory(
	db: D1Database,
	input: string | AddSipCredentialToInventoryInput
): Promise<SipCredentialInventoryRecord> {
	const record = typeof input === "string"
		? { sipUsername: input }
		: input;

	await db
		.prepare(`
			INSERT INTO sip_credential_inventory (
				sip_username,
				status,
				provider,
				provider_credential_id,
				connection_id,
				last_synced_at
			)
			VALUES (?, 'available', ?, ?, ?, CURRENT_TIMESTAMP)
			ON CONFLICT(sip_username) DO UPDATE SET
				provider = excluded.provider,
				provider_credential_id = excluded.provider_credential_id,
				connection_id = excluded.connection_id,
				last_synced_at = CURRENT_TIMESTAMP
		`)
		.bind(
			record.sipUsername,
			record.provider ?? "telnyx",
			record.providerCredentialId ?? null,
			record.connectionId ?? null
		)
		.run();

	const credential = await findSipCredentialInInventory(
		db,
		record.sipUsername
	);

	if (!credential) {
		throw new Error("Failed to add SIP credential to inventory");
	}

	return credential;
}

export async function findSipCredentialInInventory(
	db: D1Database,
	sipUsername: string
): Promise<SipCredentialInventoryRecord | null> {
	const row = await db
		.prepare(`
			SELECT
				id,
				sip_username,
				status,
				assigned_user_id,
				assigned_at,
				provider,
				provider_credential_id,
				connection_id,
				last_synced_at
			FROM sip_credential_inventory
			WHERE sip_username = ?
		`)
		.bind(sipUsername)
		.first<{
			id: number;
			sip_username: string;
			status: string;
			assigned_user_id: number | null;
			assigned_at: string | null;
			provider: string | null;
			provider_credential_id: string | null;
			connection_id: string | null;
			last_synced_at: string | null;
		}>();

	return row ? mapSipCredentialInventoryRow(row) : null;
}

export async function reserveAvailableSipCredential(
	db: D1Database,
	userId: number
): Promise<SipCredentialInventoryRecord> {
	const available = await db
		.prepare(`
			SELECT
				id,
				sip_username,
				status,
				assigned_user_id,
				assigned_at,
				provider,
				provider_credential_id,
				connection_id,
				last_synced_at
			FROM sip_credential_inventory
			WHERE status = 'available'
			ORDER BY id ASC
			LIMIT 1
		`)
		.first<{
			id: number;
			sip_username: string;
			status: string;
			assigned_user_id: number | null;
			assigned_at: string | null;
			provider: string | null;
			provider_credential_id: string | null;
			connection_id: string | null;
			last_synced_at: string | null;
		}>();

	if (!available) {
		throw new Error("No available SIP credentials");
	}

	await db
		.prepare(`
			UPDATE sip_credential_inventory
			SET status = 'assigned',
				assigned_user_id = ?,
				assigned_at = CURRENT_TIMESTAMP
			WHERE id = ?
				AND status = 'available'
		`)
		.bind(userId, available.id)
		.run();

	const reserved = await findSipCredentialInInventory(
		db,
		available.sip_username
	);

	if (!reserved || reserved.status !== "assigned" || reserved.assignedUserId !== userId) {
		throw new Error("Failed to reserve SIP credential");
	}

	return reserved;
}

export async function releaseSipCredentialForUser(
	db: D1Database,
	userId: number
): Promise<void> {
	await db
		.prepare(`
			UPDATE sip_credential_inventory
			SET status = 'available',
				assigned_user_id = NULL,
				assigned_at = NULL
			WHERE assigned_user_id = ?
		`)
		.bind(userId)
		.run();
}

export interface SipCredentialInventoryHealth {
	total: number;
	available: number;
	assigned: number;
	lowInventoryThreshold: number;
	status: "healthy" | "low_inventory" | "empty";
}

export async function getSipCredentialInventoryHealth(
	db: D1Database,
	lowInventoryThreshold = 5
): Promise<SipCredentialInventoryHealth> {
	const result = await db
		.prepare(`
			SELECT status, COUNT(*) AS count
			FROM sip_credential_inventory
			GROUP BY status
		`)
		.all<{
			status: string;
			count: number;
		}>();

	const counts = new Map(
		(result.results ?? []).map((row) => [row.status, row.count])
	);

	const available = counts.get("available") ?? 0;
	const assigned = counts.get("assigned") ?? 0;
	const total = [...counts.values()].reduce((sum, count) => sum + count, 0);

	const status = available === 0
		? "empty"
		: available <= lowInventoryThreshold
			? "low_inventory"
			: "healthy";

	return {
		total,
		available,
		assigned,
		lowInventoryThreshold,
		status
	};
}
