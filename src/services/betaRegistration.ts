import { findUserByEmail, type UserRecord } from "./users";
import { hashPassword } from "../utils/passwordHash";

export interface RegisterBetaParticipantInput {
	code: string;
	firstName: string;
	lastName: string;
	email: string;
	contactPhoneNumber: string;
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
	const email = input.email.trim().toLowerCase();
	const contactPhoneNumber = input.contactPhoneNumber.trim();
	const contactMethod = input.contactMethod.trim();
	const now = new Date().toISOString();

	if (
		!code
		|| !firstName
		|| !lastName
		|| !email
		|| !contactPhoneNumber
		|| !contactMethod
		|| !input.password
	) {
		throw new Error("All beta enrollment fields are required");
	}

	const passwordHash = await hashPassword(input.password);

	const [userInsert, inviteUpdate, invitationUpdate] = await db.batch([
		db
			.prepare(`
				INSERT INTO users (
					first_name,
					last_name,
					email,
					contact_phone_number,
					phone_number,
					contact_method,
					sms_contact_number,
					sms_capable,
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
					beta_invitations.sms_contact_number,
					beta_invitations.sms_capable,
					?,
					'participant',
					'active',
					'onboarding_incomplete',
					'active',
					'inactive'
				FROM beta_invite_codes
				INNER JOIN beta_invitations
					ON beta_invitations.id = beta_invite_codes.invitation_id
				WHERE beta_invite_codes.code = ?
					AND beta_invite_codes.status = 'active'
					AND beta_invite_codes.use_count < beta_invite_codes.max_uses
					AND beta_invite_codes.redeemed_by_user_id IS NULL
					AND beta_invitations.status = 'credential_issued'
					AND (
						(beta_invitations.selected_channel = 'email'
							AND beta_invitations.email_contact = ?)
						OR
						(beta_invitations.selected_channel = 'sms'
							AND beta_invitations.sms_capable = 1
							AND beta_invitations.sms_contact_number = ?)
					)
					AND (
						beta_invite_codes.expires_at IS NULL
						OR beta_invite_codes.expires_at > ?
					)
			`)
			.bind(
				firstName,
				lastName,
				email,
				contactPhoneNumber,
				contactPhoneNumber,
				contactMethod,
				passwordHash,
				code,
				email,
				contactPhoneNumber,
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
							AND contact_phone_number = ?
					),
					updated_at = ?
				WHERE code = ?
					AND status = 'active'
					AND use_count < max_uses
					AND redeemed_by_user_id IS NULL
					AND invitation_id IS NOT NULL
					AND EXISTS (
						SELECT 1
						FROM users
						WHERE email = ?
							AND contact_phone_number = ?
					)
			`)
			.bind(
				email,
				contactPhoneNumber,
				now,
				code,
				email,
				contactPhoneNumber
			)
		,
		db
			.prepare(`
				UPDATE beta_invitations
				SET status = 'redeemed',
					redeemed_at = ?,
					updated_at = ?
				WHERE id = (
					SELECT invitation_id
					FROM beta_invite_codes
					WHERE code = ?
						AND redeemed_by_user_id = (
							SELECT id
							FROM users
							WHERE email = ?
								AND contact_phone_number = ?
						)
				)
					AND status = 'credential_issued'
			`)
			.bind(
				now,
				now,
				code,
				email,
				contactPhoneNumber
			)
	]);

	if (
		userInsert.meta.changes !== 1
		|| inviteUpdate.meta.changes !== 1
		|| invitationUpdate.meta.changes !== 1
	) {
		return null;
	}

	const user = await findUserByEmail(db, email);

	if (!user || user.email !== email) {
		throw new Error("Failed to create beta participant account");
	}

	return {
		user,
		inviteCode: code
	};
}
