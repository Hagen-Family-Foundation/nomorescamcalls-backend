import {
	findUserById,
	updateUserProvisioningAssignment,
	type UserRecord
} from "./users";
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
	provisioningStatus: "active";
	steps: Array<{
		name: string;
		status: "complete";
	}>;
}

export async function provisionSubscriber(
	db: D1Database,
	userId: number
): Promise<ProvisionSubscriberResult> {
	const existingUser = await findUserById(db, userId);

	if (!existingUser) {
		throw new Error("Subscriber not found");
	}

	if (
		existingUser.screeningNumber
		&& existingUser.sipUsername
	) {
		return {
			user: existingUser,
			coverageStatus: existingUser.coverageStatus,
			provisioningStatus: "active",
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
		throw new Error(
			"Subscriber has incomplete provisioning state"
		);
	}

	try {
		const reservedNumber =
			await reserveAvailableScreeningNumber(
				db,
				userId
			);

		const reservedSipCredential =
			await reserveAvailableSipCredential(
				db,
				userId
			);

		const user =
			await updateUserProvisioningAssignment(
				db,
				userId,
				reservedNumber.phoneNumber,
				reservedSipCredential.sipUsername
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
					name:
						"screening_number_reserved_from_inventory",
					status: "complete"
				},
				{
					name: "sip_username_assigned",
					status: "complete"
				},
				{
					name: "coverage_pending_verification",
					status: "complete"
				}
			]
		};
	} catch (error) {
		await releaseScreeningNumberForUser(db, userId);
		await releaseSipCredentialForUser(db, userId);

		throw error;
	}
}
