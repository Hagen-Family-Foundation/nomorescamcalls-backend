export interface ScreeningNumberInventoryRecord {
	id: number;
	phoneNumber: string;
	status: string;
	assignedUserId: number | null;
	assignedAt: string | null;
}

function mapInventoryRow(row: {
	id: number;
	phone_number: string;
	status: string;
	assigned_user_id: number | null;
	assigned_at: string | null;
}): ScreeningNumberInventoryRecord {
	return {
		id: row.id,
		phoneNumber: row.phone_number,
		status: row.status,
		assignedUserId: row.assigned_user_id,
		assignedAt: row.assigned_at
	};
}

export async function addScreeningNumberToInventory(
	db: D1Database,
	phoneNumber: string
): Promise<ScreeningNumberInventoryRecord> {
	await db
		.prepare(`
			INSERT INTO screening_number_inventory (phone_number, status)
			VALUES (?, 'available')
			ON CONFLICT(phone_number) DO NOTHING
		`)
		.bind(phoneNumber)
		.run();

	const number = await findScreeningNumberInInventory(db, phoneNumber);

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
			SELECT id, phone_number, status, assigned_user_id, assigned_at
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
		}>();

	return row ? mapInventoryRow(row) : null;
}

export async function reserveAvailableScreeningNumber(
	db: D1Database,
	userId: number
): Promise<ScreeningNumberInventoryRecord> {
	const available = await db
		.prepare(`
			SELECT id, phone_number, status, assigned_user_id, assigned_at
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
