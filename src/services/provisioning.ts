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
	toCustomerProtectedLine,
	type CustomerProtectedLineRecord,
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
import {
	deliverCustomerCommunication,
	findLatestCustomerCommunication,
	selectAccountCommunicationDestination,
	type CustomerCommunicationProvider,
	type CustomerCommunicationRecord
} from "./customerCommunications";

export interface ProvisionProtectedLineResult {
	account: UserRecord;
	protectedLine: CustomerProtectedLineRecord;
	coverageStatus: string;
	provisioningStatus: "provisioned" | "already_provisioned";
	forwardingInstructions: {
		protectedPhoneNumber: string;
		screeningNumber: string;
		forwardingStatus: CustomerProtectedLineRecord["forwardingStatus"];
		instructions: string;
	};
	delivery: CustomerCommunicationRecord;
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

async function provisionedResult(
	db: D1Database,
	account: UserRecord,
	protectedLine: ProtectedLineRecord,
	provisioningStatus: "provisioned" | "already_provisioned",
	provider?: CustomerCommunicationProvider
): Promise<ProvisionProtectedLineResult> {
	if (!protectedLine.screeningNumber) {
		throw new Error("Provisioned Protected Line is missing its screening number");
	}

	const destination = selectAccountCommunicationDestination(account);
	const instructions = `For protected line ${protectedLine.protectedPhoneNumber}, forward calls to ${protectedLine.screeningNumber}. After forwarding is set, confirm this exact line in the portal.`;
	let delivery = await findLatestCustomerCommunication(db, {
		protectedLineId: protectedLine.id,
		purpose: "forwarding_instructions"
	});
	const providerCanRetry = Boolean(
		provider
		&& !provider.unavailableReason
		&& (!provider.channel || provider.channel === destination.channel)
	);
	if (
		!delivery
		|| (
			providerCanRetry
			&& (delivery.status === "failed" || delivery.status === "provider_unavailable")
		)
	) {
		delivery = await deliverCustomerCommunication(
			db,
			{
				userId: account.id,
				protectedLineId: protectedLine.id,
				purpose: "forwarding_instructions",
				message: {
					channel: destination.channel,
					destination: destination.destination,
					subject: destination.channel === "email"
						? "Set up call forwarding for your Protected Line"
						: null,
					body: instructions
				}
			},
			provider
		);
	}

	return {
		account,
		protectedLine: toCustomerProtectedLine(protectedLine),
		coverageStatus: protectedLine.coverageStatus,
		provisioningStatus,
		forwardingInstructions: {
			protectedPhoneNumber: protectedLine.protectedPhoneNumber,
			screeningNumber: protectedLine.screeningNumber,
			forwardingStatus: protectedLine.forwardingStatus,
			instructions
		},
		delivery,
		steps: [
			{ name: "existing_account_found", status: "complete" },
			{ name: "existing_location_found", status: "complete" },
			{ name: "existing_protected_line_found", status: "complete" },
			{ name: "screening_number_assigned", status: "complete" },
			{ name: "sip_credential_assigned", status: "complete" },
			{ name: "forwarding_instructions_created", status: "complete" },
			{ name: "forwarding_confirmation_required", status: "complete" }
		]
	};
}

export async function provisionProtectedLine(
	db: D1Database,
	lineId: number,
	options: {
		provider?: CustomerCommunicationProvider;
	} = {}
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
	) {
		return provisionedResult(
			db,
			account,
			existingLine,
			"already_provisioned",
			options.provider
		);
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

		return provisionedResult(
			db,
			account,
			protectedLine,
			"provisioned",
			options.provider
		);
	} catch (error) {
		const currentLine = await findProtectedLineById(db, lineId);

		if (
			currentLine?.provisioningStatus === "provisioned"
			&& currentLine.screeningNumber
			&& currentLine.sipUsername
		) {
			return provisionedResult(
				db,
				account,
				currentLine,
				"provisioned",
				options.provider
			);
		}

		await releaseScreeningNumberForProtectedLine(db, lineId);
		await releaseSipCredentialForProtectedLine(db, lineId);
		await markProtectedLineProvisioningFailed(db, lineId);

		throw error;
	}
}
