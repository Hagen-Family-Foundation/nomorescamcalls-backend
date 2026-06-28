import {
	createUser,
	deleteUserById,
	findUserByPhoneNumber,
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

export interface ProvisionSubscriberInput {
	fullName: string;
	email: string;
	phoneNumber: string;
}

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
	input: ProvisionSubscriberInput
): Promise<ProvisionSubscriberResult> {
	const existingUser = await findUserByPhoneNumber(db, input.phoneNumber);

	if (existingUser?.screeningNumber && existingUser.sipUsername) {
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
					name: "coverage_active",
					status: "complete"
				}
			]
		};
	}

	const pendingUser = await createUser(
		db,
		{
			fullName: input.fullName,
			email: input.email,
			phoneNumber: input.phoneNumber,
			status: "provisioning",
			coverageStatus: "pending"
		}
	);

	try {
		const reservedNumber = await reserveAvailableScreeningNumber(
			db,
			pendingUser.id
		);

		const reservedSipCredential = await reserveAvailableSipCredential(
			db,
			pendingUser.id
		);

		const user = await updateUserProvisioningAssignment(
			db,
			pendingUser.id,
			reservedNumber.phoneNumber,
			reservedSipCredential.sipUsername
		);

		return {
			user,
			coverageStatus: user.coverageStatus,
			provisioningStatus: "active",
			steps: [
				{
					name: "subscriber_record_created",
					status: "complete"
				},
				{
					name: "screening_number_reserved_from_inventory",
					status: "complete"
				},
				{
					name: "sip_username_assigned",
					status: "complete"
				},
				{
					name: "coverage_activated",
					status: "complete"
				}
			]
		};
	} catch (error) {
		await releaseScreeningNumberForUser(db, pendingUser.id);
		await releaseSipCredentialForUser(db, pendingUser.id);
		await deleteUserById(db, pendingUser.id);

		throw error;
	}
}
