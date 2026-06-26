import { hashPhoneNumber } from "../utils/hash";
import { createUser, type UserRecord } from "./users";

export interface ProvisionSubscriberInput {
	fullName: string;
	email: string;
	phoneNumber: string;
	screeningNumber: string;
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

export async function createInternalAppIdentity(
	phoneNumber: string
): Promise<string> {
	const hash = await hashPhoneNumber(phoneNumber);
	return `nmcs_app_${hash.slice(0, 16)}`;
}

export async function provisionSubscriber(
	db: D1Database,
	input: ProvisionSubscriberInput
): Promise<ProvisionSubscriberResult> {
	const appIdentity = await createInternalAppIdentity(input.phoneNumber);

	const user = await createUser(
		db,
		{
			fullName: input.fullName,
			email: input.email,
			phoneNumber: input.phoneNumber,
			screeningNumber: input.screeningNumber,
			appIdentity,
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
				name: "screening_number_assigned",
				status: "complete"
			},
			{
				name: "internal_app_identity_created",
				status: "complete"
			},
			{
				name: "coverage_activated",
				status: "complete"
			}
		]
	};
}
