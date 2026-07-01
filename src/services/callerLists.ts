export type CallerListType = "allow" | "block";

export interface CallerListRow {
	id: number;
	user_id: number | null;
	phone_number: string;
	reason: string;
	created_at: string;
}

function tableNameForList(
	listType: CallerListType
): "allow_list" | "block_list" {
	return listType === "allow" ? "allow_list" : "block_list";
}

export async function listCallerListEntries(
	db: D1Database,
	listType: CallerListType,
	limit = 25
): Promise<CallerListRow[]> {
	const safeLimit = Math.max(1, Math.min(limit, 100));
	const tableName = tableNameForList(listType);

	const result = await db
		.prepare(`
			SELECT
				id,
				user_id,
				phone_number,
				reason,
				created_at
			FROM ${tableName}
			ORDER BY id DESC
			LIMIT ?
		`)
		.bind(safeLimit)
		.all<CallerListRow>();

	return result.results;
}

export async function addCallerListEntry(
	db: D1Database,
	listType: CallerListType,
	phoneNumber: string,
	reason: string,
	userId: number | null = null
): Promise<void> {
	const tableName = tableNameForList(listType);

	await db
		.prepare(`
			INSERT INTO ${tableName} (
				user_id,
				phone_number,
				reason
			)
			VALUES (?, ?, ?)
			ON CONFLICT(user_id, phone_number) DO UPDATE SET
				user_id = excluded.user_id,
				reason = excluded.reason
		`)
		.bind(
			userId,
			phoneNumber,
			reason
		)
		.run();
}

export async function removeCallerListEntry(
	db: D1Database,
	listType: CallerListType,
	phoneNumber: string
): Promise<boolean> {
	const tableName = tableNameForList(listType);

	const result = await db
		.prepare(
			`DELETE FROM ${tableName} WHERE phone_number = ?`
		)
		.bind(phoneNumber)
		.run();

	return result.meta.changes > 0;
}
