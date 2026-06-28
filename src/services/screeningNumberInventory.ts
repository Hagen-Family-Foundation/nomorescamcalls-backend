export interface ScreeningNumberInventoryRecord {
	id: number;
	phoneNumber: string;
	status: string;
	assignedUserId: number | null;
	assignedAt: string | null;
	provider: string;
	providerNumberId: string | null;
	voiceApplicationId: string | null;
	connectionId: string | null;
	lastSyncedAt: string | null;
}

function mapInventoryRow(row: {
	id: number;
	phone_number: string;
	status: string;
	assigned_user_id: number | null;
	assigned_at: string | null;
	provider?: string | null;
	provider_number_id?: string | null;
	voice_application_id?: string | null;
	connection_id?: string | null;
	last_synced_at?: string | null;
}): ScreeningNumberInventoryRecord {
	return {
		id: row.id,
		phoneNumber: row.phone_number,
		status: row.status,
		assignedUserId: row.assigned_user_id,
		assignedAt: row.assigned_at,
		provider: row.provider ?? "telnyx",
		providerNumberId: row.provider_number_id ?? null,
		voiceApplicationId: row.voice_application_id ?? null,
		connectionId: row.connection_id ?? null,
		lastSyncedAt: row.last_synced_at ?? null
	};
}

export interface AddScreeningNumberToInventoryInput {
	phoneNumber: string;
	provider?: string;
	providerNumberId?: string | null;
	voiceApplicationId?: string | null;
	connectionId?: string | null;
}

export async function addScreeningNumberToInventory(
	db: D1Database,
	input: string | AddScreeningNumberToInventoryInput
): Promise<ScreeningNumberInventoryRecord> {
	const record = typeof input === "string"
		? { phoneNumber: input }
		: input;

	await db
		.prepare(`
			INSERT INTO screening_number_inventory (
				phone_number,
				status,
				provider,
				provider_number_id,
				voice_application_id,
				connection_id,
				last_synced_at
			)
			VALUES (?, 'available', ?, ?, ?, ?, CURRENT_TIMESTAMP)
			ON CONFLICT(phone_number) DO UPDATE SET
				provider = excluded.provider,
				provider_number_id = excluded.provider_number_id,
				voice_application_id = excluded.voice_application_id,
				connection_id = excluded.connection_id,
				last_synced_at = CURRENT_TIMESTAMP
		`)
		.bind(
			record.phoneNumber,
			record.provider ?? "telnyx",
			record.providerNumberId ?? null,
			record.voiceApplicationId ?? null,
			record.connectionId ?? null
		)
		.run();

	const number = await findScreeningNumberInInventory(db, record.phoneNumber);

	if (!number) {
		throw new Error("Failed to add screening number to inventory");
	}

	return number;
}

export async function findScreeningNumberInInventory(
	db: D1Database,
	phoneNumber: string
): Promise<ScreeningNumberInventoryRecord | null> {
	const row = await db
		.prepare(`
			SELECT
				id,
				phone_number,
				status,
				assigned_user_id,
				assigned_at,
				provider,
				provider_number_id,
				voice_application_id,
				connection_id,
				last_synced_at
			FROM screening_number_inventory
			WHERE phone_number = ?
		`)
		.bind(phoneNumber)
		.first<{
			id: number;
			phone_number: string;
			status: string;
			assigned_user_id: number | null;
			assigned_at: string | null;
			provider: string | null;
			provider_number_id: string | null;
			voice_application_id: string | null;
			connection_id: string | null;
			last_synced_at: string | null;
		}>();

	return row ? mapInventoryRow(row) : null;
}

export async function reserveAvailableScreeningNumber(
	db: D1Database,
	userId: number
): Promise<ScreeningNumberInventoryRecord> {
	const available = await db
		.prepare(`
			SELECT
				id,
				phone_number,
				status,
				assigned_user_id,
				assigned_at,
				provider,
				provider_number_id,
				voice_application_id,
				connection_id,
				last_synced_at
			FROM screening_number_inventory
			WHERE status = 'available'
			ORDER BY id ASC
			LIMIT 1
		`)
		.first<{
			id: number;
			phone_number: string;
			status: string;
			assigned_user_id: number | null;
			assigned_at: string | null;
			provider: string | null;
			provider_number_id: string | null;
			voice_application_id: string | null;
			connection_id: string | null;
			last_synced_at: string | null;
		}>();

	if (!available) {
		throw new Error("No available screening numbers");
	}

	await db
		.prepare(`
			UPDATE screening_number_inventory
			SET status = 'assigned',
				assigned_user_id = ?,
				assigned_at = CURRENT_TIMESTAMP
			WHERE id = ?
				AND status = 'available'
		`)
		.bind(userId, available.id)
		.run();

	const reserved = await findScreeningNumberInInventory(
		db,
		available.phone_number
	);

	if (!reserved || reserved.status !== "assigned" || reserved.assignedUserId !== userId) {
		throw new Error("Failed to reserve screening number");
	}

	return reserved;
}

export async function releaseScreeningNumberForUser(
	db: D1Database,
	userId: number
): Promise<void> {
	await db
		.prepare(`
			UPDATE screening_number_inventory
			SET status = 'available',
				assigned_user_id = NULL,
				assigned_at = NULL
			WHERE assigned_user_id = ?
		`)
		.bind(userId)
		.run();
}

export interface ScreeningNumberInventoryHealth {
	total: number;
	available: number;
	assigned: number;
	lowInventoryThreshold: number;
	status: "healthy" | "low_inventory" | "empty";
}

export async function getScreeningNumberInventoryHealth(
	db: D1Database,
	lowInventoryThreshold = 5
): Promise<ScreeningNumberInventoryHealth> {
	const result = await db
		.prepare(`
			SELECT status, COUNT(*) AS count
			FROM screening_number_inventory
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
