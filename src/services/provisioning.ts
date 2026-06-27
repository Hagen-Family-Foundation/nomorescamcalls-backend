import { createUser, findUserByPhoneNumber, type UserRecord } from "./users";
import { reserveAvailableScreeningNumber } from "./screeningNumberInventory";

export interface ProvisionSubscriberInput {
	fullName: string;
	email: string;
	phoneNumber: string;
	sipUsername: string;
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

	if (existingUser?.screeningNumber) {
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
			sipUsername: input.sipUsername,
			status: "provisioning",
			coverageStatus: "pending"
		}
	);

	const reservedNumber = await reserveAvailableScreeningNumber(
		db,
		pendingUser.id
	);

	const user = await createUser(
		db,
		{
			fullName: input.fullName,
			email: input.email,
			phoneNumber: input.phoneNumber,
			screeningNumber: reservedNumber.phoneNumber,
			sipUsername: input.sipUsername,
			status: "active",
			coverageStatus: "active"
		}
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
}
