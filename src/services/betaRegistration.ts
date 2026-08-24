import { findUserByPhoneNumber, type UserRecord } from "./users";
import { hashPassword } from "../utils/passwordHash";

export interface RegisterBetaParticipantInput {
	code: string;
	firstName: string;
	lastName: string;
	callerFacingBusinessName: string;
	email: string;
	phoneNumber: string;
	carrier: string;
	contactMethod: string;
	password: string;
}

export interface RegisterBetaParticipantResult {
	user: UserRecord;
	inviteCode: string;
}

export async function registerBetaParticipant(
	db: D1Database,
	input: RegisterBetaParticipantInput
): Promise<RegisterBetaParticipantResult | null> {
	const code = input.code.trim();
	const firstName = input.firstName.trim();
	const lastName = input.lastName.trim();
	const callerFacingBusinessName =
		input.callerFacingBusinessName.trim();
	const email = input.email.trim().toLowerCase();
	const phoneNumber = input.phoneNumber.trim();
	const carrier = input.carrier.trim();
	const contactMethod = input.contactMethod.trim();
	const now = new Date().toISOString();

	const passwordHash = await hashPassword(input.password);

	const [userInsert, inviteUpdate] = await db.batch([
		db
			.prepare(`
				INSERT INTO users (
					first_name,
					last_name,
					caller_facing_business_name,
					email,
					phone_number,
					carrier,
					contact_method,
					password_hash,
					role,
					account_status,
					setup_status,
					status,
					coverage_status
				)
				SELECT
					?,
					?,
					?,
					?,
					?,
					?,
					?,
					?,
					'participant',
					'active',
					'registration_information_completed',
					'active',
					'inactive'
				FROM beta_invite_codes
				WHERE code = ?
					AND status = 'active'
					AND use_count < max_uses
					AND redeemed_by_user_id IS NULL
					AND (
						expires_at IS NULL
						OR expires_at > ?
					)
			`)
			.bind(
				firstName,
				lastName,
				callerFacingBusinessName,
				email,
				phoneNumber,
				carrier,
				contactMethod,
				passwordHash,
				code,
				now
			),
		db
			.prepare(`
				UPDATE beta_invite_codes
				SET use_count = use_count + 1,
					status = CASE
						WHEN use_count + 1 >= max_uses THEN 'used'
						ELSE status
					END,
					redeemed_by_user_id = (
						SELECT id
						FROM users
						WHERE email = ?
							AND phone_number = ?
					),
					updated_at = ?
				WHERE code = ?
					AND status = 'active'
					AND use_count < max_uses
					AND redeemed_by_user_id IS NULL
					AND EXISTS (
						SELECT 1
						FROM users
						WHERE email = ?
							AND phone_number = ?
					)
			`)
			.bind(
				email,
				phoneNumber,
				now,
				code,
				email,
				phoneNumber
			)
	]);

	if (
		userInsert.meta.changes !== 1
		|| inviteUpdate.meta.changes !== 1
	) {
		return null;
	}

	const user = await findUserByPhoneNumber(db, phoneNumber);

	if (!user || user.email !== email) {
		throw new Error("Failed to create beta participant account");
	}

	return {
		user,
		inviteCode: code
	};
}
