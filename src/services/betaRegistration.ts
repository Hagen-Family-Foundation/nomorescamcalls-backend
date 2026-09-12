import { createUser, type UserRecord } from "./users";
import { hashPassword } from "../utils/passwordHash";

export interface RegisterBetaParticipantInput {
	betaAccessCode: string;
	firstName: string;
	lastName: string;
	email: string;
	contactPhoneNumber: string;
	contactMethod: string;
	password: string;
}

export interface RegisterBetaParticipantResult {
	user: UserRecord;
}

export class BetaRegistrationError extends Error {
	constructor(
		message: string,
		readonly code: string,
		readonly status: number
	) {
		super(message);
		this.name = "BetaRegistrationError";
	}
}

function isFourDigitCode(value: string): boolean {
	return /^\d{4}$/.test(value);
}

function codesMatch(submitted: string, configured: string): boolean {
	let difference = 0;
	for (let index = 0; index < configured.length; index += 1) {
		difference |= submitted.charCodeAt(index) ^ configured.charCodeAt(index);
	}
	return difference === 0;
}

export async function registerBetaParticipant(
	db: D1Database,
	input: RegisterBetaParticipantInput,
	configuredBetaAccessCode: string | undefined
): Promise<RegisterBetaParticipantResult> {
	const betaAccessCode = input.betaAccessCode.trim();
	const firstName = input.firstName.trim();
	const lastName = input.lastName.trim();
	const email = input.email.trim().toLowerCase();
	const contactPhoneNumber = input.contactPhoneNumber.trim();
	const contactMethod = input.contactMethod.trim();

	if (
		!betaAccessCode
		|| !firstName
		|| !lastName
		|| !email
		|| !contactPhoneNumber
		|| !contactMethod
		|| !input.password
	) {
		throw new Error("All beta enrollment fields are required");
	}

	const configuredCode = configuredBetaAccessCode ?? "";
	if (!isFourDigitCode(configuredCode)) {
		throw new BetaRegistrationError(
			"Beta registration is temporarily unavailable",
			"beta_access_configuration_unavailable",
			503
		);
	}

	if (!isFourDigitCode(betaAccessCode) || !codesMatch(betaAccessCode, configuredCode)) {
		throw new BetaRegistrationError(
			"Beta access code is invalid",
			"invalid_beta_access_code",
			403
		);
	}

	const user = await createUser(db, {
		firstName,
		lastName,
		email,
		contactPhoneNumber,
		contactMethod,
		passwordHash: await hashPassword(input.password),
		role: "participant"
	});

	return {
		user
	};
}
