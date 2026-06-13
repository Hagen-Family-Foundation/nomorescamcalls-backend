export interface UserRecord {
	id: number;
	phoneNumber: string;
	screeningNumber: string | null;
	appIdentity: string | null;
	status: string;
}

export async function findUserByScreeningNumber(
	db: D1Database,
	screeningNumber: string
): Promise<UserRecord | null> {
	const row = await db
		.prepare(`
			SELECT
				id,
				phone_number,
				screening_number,
				app_identity,
				status
			FROM users
			WHERE screening_number = ?
				AND status = 'active'
		`)
		.bind(screeningNumber)
		.first<{
			id: number;
			phone_number: string;
			screening_number: string | null;
			app_identity: string | null;
			status: string;
		}>();

	if (!row) {
		return null;
	}

	return {
		id: row.id,
		phoneNumber: row.phone_number,
		screeningNumber: row.screening_number,
		appIdentity: row.app_identity,
		status: row.status
	};
}
