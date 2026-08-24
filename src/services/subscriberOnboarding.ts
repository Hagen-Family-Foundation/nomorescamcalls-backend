import { hashPassword } from "../utils/passwordHash";
import {
	findUserById,
	updateUserOnboardingInformation,
	updateUserOnboardingState,
	type UpdateUserOnboardingInput,
	type UserRecord
} from "./users";

export type SubscriberOnboardingRequirement =
	| "first_name"
	| "last_name"
	| "caller_facing_business_name"
	| "email"
	| "phone_number"
	| "carrier"
	| "contact_method"
	| "password"
	| "required_agreement";

export interface SubscriberOnboardingStatus {
	user: UserRecord;
	complete: boolean;
	missingRequirements: SubscriberOnboardingRequirement[];
	agreementVersion: string | null;
	agreementAccepted: boolean;
}

export interface UpdateSubscriberOnboardingInput
	extends Omit<UpdateUserOnboardingInput, "passwordHash"> {
	password?: string | null;
}

interface OnboardingRow {
	first_name: string | null;
	last_name: string | null;
	caller_facing_business_name: string | null;
	email: string | null;
	phone_number: string;
	carrier: string | null;
	contact_method: string | null;
	password_hash: string | null;
	agreement_version: string | null;
	agreement_acceptance_id: number | null;
}

function isPresent(value: string | null): boolean {
	return Boolean(value?.trim());
}

export async function getSubscriberOnboardingStatus(
	db: D1Database,
	userId: number
): Promise<SubscriberOnboardingStatus> {
	const [user, row] = await Promise.all([
		findUserById(db, userId),
		db
			.prepare(`
				SELECT
					users.first_name,
					users.last_name,
					users.caller_facing_business_name,
					users.email,
					users.phone_number,
					users.carrier,
					users.contact_method,
					users.password_hash,
					beta_agreements.version AS agreement_version,
					beta_agreement_acceptances.id AS agreement_acceptance_id
				FROM users
				LEFT JOIN beta_agreements
					ON beta_agreements.active = 1
				LEFT JOIN beta_agreement_acceptances
					ON beta_agreement_acceptances.user_id = users.id
					AND beta_agreement_acceptances.agreement_version =
						beta_agreements.version
				WHERE users.id = ?
					AND users.status = 'active'
				LIMIT 1
			`)
			.bind(userId)
			.first<OnboardingRow>()
	]);

	if (!user || !row) {
		throw new Error("Subscriber not found");
	}

	const missingRequirements: SubscriberOnboardingRequirement[] = [];
	const requiredValues: Array<[
		SubscriberOnboardingRequirement,
		string | null
	]> = [
		["first_name", row.first_name],
		["last_name", row.last_name],
		["caller_facing_business_name", row.caller_facing_business_name],
		["email", row.email],
		["phone_number", row.phone_number],
		["carrier", row.carrier],
		["contact_method", row.contact_method],
		["password", row.password_hash]
	];

	for (const [requirement, value] of requiredValues) {
		if (!isPresent(value)) {
			missingRequirements.push(requirement);
		}
	}

	const agreementAccepted =
		row.agreement_version !== null
		&& row.agreement_acceptance_id !== null;

	if (!agreementAccepted) {
		missingRequirements.push("required_agreement");
	}

	return {
		user,
		complete: missingRequirements.length === 0,
		missingRequirements,
		agreementVersion: row.agreement_version,
		agreementAccepted
	};
}

export async function refreshSubscriberOnboardingStatus(
	db: D1Database,
	userId: number
): Promise<SubscriberOnboardingStatus> {
	const onboarding = await getSubscriberOnboardingStatus(db, userId);

	await updateUserOnboardingState(
		db,
		userId,
		onboarding.complete
			? "onboarding_complete"
			: "onboarding_incomplete"
	);

	if (onboarding.user.coverageStatus === "active") {
		return onboarding;
	}

	return {
		...onboarding,
		user: {
			...onboarding.user,
			setupStatus: onboarding.complete
				? "onboarding_complete"
				: "onboarding_incomplete",
			coverageStatus: "inactive"
		}
	};
}

export async function updateSubscriberOnboarding(
	db: D1Database,
	userId: number,
	input: UpdateSubscriberOnboardingInput
): Promise<SubscriberOnboardingStatus> {
	const password = input.password?.trim();
	const passwordHash = password
		? await hashPassword(password)
		: undefined;

	await updateUserOnboardingInformation(
		db,
		userId,
		{
			firstName: input.firstName,
			lastName: input.lastName,
			callerFacingBusinessName:
				input.callerFacingBusinessName,
			email: input.email,
			phoneNumber: input.phoneNumber,
			carrier: input.carrier,
			contactMethod: input.contactMethod,
			passwordHash
		}
	);

	return refreshSubscriberOnboardingStatus(db, userId);
}
