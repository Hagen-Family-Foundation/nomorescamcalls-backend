import {
	findUserById,
	updateUserProvisioningAssignment,
	type UserRecord
} from "./users";
import {
	refreshSubscriberOnboardingStatus,
	type SubscriberOnboardingRequirement
} from "./subscriberOnboarding";
import {
	releaseScreeningNumberForUser,
	reserveAvailableScreeningNumber
} from "./screeningNumberInventory";
import {
	releaseSipCredentialForUser,
	reserveAvailableSipCredential
} from "./sipCredentialInventory";

export interface ProvisionSubscriberResult {
	user: UserRecord;
	coverageStatus: string;
	provisioningStatus: "active" | "already_provisioned";
	steps: Array<{
		name: string;
		status: "complete";
	}>;
}

export class SubscriberProvisioningError extends Error {
	constructor(
		message: string,
		readonly code: string,
		readonly missingRequirements: SubscriberOnboardingRequirement[] = []
	) {
		super(message);
		this.name = "SubscriberProvisioningError";
	}
}

export async function provisionSubscriber(
	db: D1Database,
	userId: number
): Promise<ProvisionSubscriberResult> {
	const existingUser = await findUserById(db, userId);

	if (!existingUser) {
		throw new SubscriberProvisioningError(
			"Subscriber not found",
			"subscriber_not_found"
		);
	}

	const onboarding =
		await refreshSubscriberOnboardingStatus(db, userId);

	if (!onboarding.complete) {
		throw new SubscriberProvisioningError(
			`Subscriber onboarding is incomplete: ${onboarding.missingRequirements.join(", ")}`,
			"onboarding_incomplete",
			onboarding.missingRequirements
		);
	}

	if (
		existingUser.screeningNumber
		&& existingUser.sipUsername
		&& existingUser.coverageStatus === "active"
	) {
		return {
			user: existingUser,
			coverageStatus: existingUser.coverageStatus,
			provisioningStatus: "already_provisioned",
			steps: [
				{
					name: "existing_subscriber_found",
					status: "complete"
				},
				{
					name: "telephony_resources_already_assigned",
					status: "complete"
				}
			]
		};
	}

	if (
		existingUser.screeningNumber
		|| existingUser.sipUsername
	) {
		throw new SubscriberProvisioningError(
			"Subscriber has incomplete provisioning state",
			"incomplete_provisioning_state"
		);
	}

	try {
		const assignedScreeningNumber =
			await reserveAvailableScreeningNumber(
				db,
				userId
			);

		const assignedSipCredential =
			await reserveAvailableSipCredential(
				db,
				userId
			);

		const user =
			await updateUserProvisioningAssignment(
				db,
				userId,
				assignedScreeningNumber.phoneNumber,
				assignedSipCredential.sipUsername
			);

		return {
			user,
			coverageStatus: user.coverageStatus,
			provisioningStatus: "active",
			steps: [
				{
					name: "existing_subscriber_found",
					status: "complete"
				},
				{
					name: "screening_number_assigned",
					status: "complete"
				},
				{
					name: "sip_credential_assigned",
					status: "complete"
				},
				{
					name: "coverage_active",
					status: "complete"
				}
			]
		};
	} catch (error) {
		const currentUser = await findUserById(db, userId);

		if (
			currentUser?.coverageStatus === "active"
			&& currentUser.screeningNumber
			&& currentUser.sipUsername
		) {
			return {
				user: currentUser,
				coverageStatus: currentUser.coverageStatus,
				provisioningStatus: "active",
				steps: [
					{
						name: "existing_subscriber_found",
						status: "complete"
					},
					{
						name: "screening_number_assigned",
						status: "complete"
					},
					{
						name: "sip_credential_assigned",
						status: "complete"
					},
					{
						name: "coverage_active",
						status: "complete"
					}
				]
			};
		}

		await releaseScreeningNumberForUser(db, userId);
		await releaseSipCredentialForUser(db, userId);

		throw error;
	}
}
