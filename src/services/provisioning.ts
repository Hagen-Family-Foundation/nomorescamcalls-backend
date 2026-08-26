import {
	findUserById,
	type UserRecord
} from "./users";
import {
	refreshSubscriberOnboardingStatus,
	type SubscriberOnboardingRequirement
} from "./subscriberOnboarding";
import {
	assignProtectedLineResources,
	findProtectedLineById,
	markProtectedLineProvisioningFailed,
	type ProtectedLineRecord
} from "./protectedLines";
import {
	releaseScreeningNumberForProtectedLine,
	reserveAvailableScreeningNumber
} from "./screeningNumberInventory";
import {
	releaseSipCredentialForProtectedLine,
	reserveAvailableSipCredential
} from "./sipCredentialInventory";

export interface ProvisionProtectedLineResult {
	account: UserRecord;
	protectedLine: ProtectedLineRecord;
	coverageStatus: string;
	provisioningStatus: "active" | "already_provisioned";
	steps: Array<{
		name: string;
		status: "complete";
	}>;
}

export class ProtectedLineProvisioningError extends Error {
	constructor(
		message: string,
		readonly code: string,
		readonly missingRequirements: SubscriberOnboardingRequirement[] = []
	) {
		super(message);
		this.name = "ProtectedLineProvisioningError";
	}
}

function activeResult(
	account: UserRecord,
	protectedLine: ProtectedLineRecord,
	provisioningStatus: "active" | "already_provisioned"
): ProvisionProtectedLineResult {
	return {
		account,
		protectedLine,
		coverageStatus: protectedLine.coverageStatus,
		provisioningStatus,
		steps: [
			{ name: "existing_account_found", status: "complete" },
			{ name: "existing_location_found", status: "complete" },
			{ name: "existing_protected_line_found", status: "complete" },
			{ name: "screening_number_assigned", status: "complete" },
			{ name: "sip_credential_assigned", status: "complete" },
			{ name: "line_coverage_active", status: "complete" }
		]
	};
}

export async function provisionProtectedLine(
	db: D1Database,
	lineId: number
): Promise<ProvisionProtectedLineResult> {
	const existingLine = await findProtectedLineById(db, lineId);

	if (!existingLine) {
		throw new ProtectedLineProvisioningError(
			"Protected line not found",
			"protected_line_not_found"
		);
	}

	const account = await findUserById(db, existingLine.userId);

	if (!account || account.accountStatus !== "active") {
		throw new ProtectedLineProvisioningError(
			"Customer account not found",
			"account_not_found"
		);
	}

	const onboarding = await refreshSubscriberOnboardingStatus(
		db,
		account.id
	);

	if (!onboarding.complete) {
		throw new ProtectedLineProvisioningError(
			`Customer account onboarding is incomplete: ${onboarding.missingRequirements.join(", ")}`,
			"onboarding_incomplete",
			onboarding.missingRequirements
		);
	}

	if (
		existingLine.screeningNumber
		&& existingLine.sipUsername
		&& existingLine.provisioningStatus === "provisioned"
		&& existingLine.coverageStatus === "active"
	) {
		return activeResult(account, existingLine, "already_provisioned");
	}

	if (existingLine.screeningNumber || existingLine.sipUsername) {
		throw new ProtectedLineProvisioningError(
			"Protected line has incomplete provisioning state",
			"incomplete_provisioning_state"
		);
	}

	try {
		const assignedScreeningNumber =
			await reserveAvailableScreeningNumber(
				db,
				existingLine.id,
				existingLine.userId
			);

		const assignedSipCredential =
			await reserveAvailableSipCredential(
				db,
				existingLine.id,
				existingLine.userId
			);

		const protectedLine = await assignProtectedLineResources(
			db,
			existingLine.id,
			assignedScreeningNumber.phoneNumber,
			assignedSipCredential.sipUsername
		);

		return activeResult(account, protectedLine, "active");
	} catch (error) {
		const currentLine = await findProtectedLineById(db, lineId);

		if (
			currentLine?.provisioningStatus === "provisioned"
			&& currentLine.coverageStatus === "active"
			&& currentLine.screeningNumber
			&& currentLine.sipUsername
		) {
			return activeResult(account, currentLine, "active");
		}

		await releaseScreeningNumberForProtectedLine(db, lineId);
		await releaseSipCredentialForProtectedLine(db, lineId);
		await markProtectedLineProvisioningFailed(db, lineId);

		throw error;
	}
}
