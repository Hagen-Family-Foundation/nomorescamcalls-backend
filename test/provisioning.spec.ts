import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { acceptCurrentBetaAgreement } from "../src/services/betaAgreement";
import {
	addScreeningNumberToInventory,
	findScreeningNumberInInventory
} from "../src/services/screeningNumberInventory";
import {
	addSipCredentialToInventory,
	findSipCredentialInInventory
} from "../src/services/sipCredentialInventory";
import {
	provisionSubscriber,
	type SubscriberProvisioningError
} from "../src/services/provisioning";
import {
	getSubscriberOnboardingStatus,
	updateSubscriberOnboarding
} from "../src/services/subscriberOnboarding";
import { createUser, findUserById } from "../src/services/users";
import { ensureTestSchema } from "./testSchema";

async function createCompleteInformationSubscriber(
	phoneNumber: string,
	role: "subscriber" | "participant" = "subscriber"
) {
	return createUser(env.nomorescamcalls_db, {
		firstName: "Account",
		lastName: "Owner",
		callerFacingBusinessName: "Our Office",
		email: `${phoneNumber.slice(-4)}@example.com`,
		phoneNumber,
		carrier: "Example Carrier",
		contactMethod: "email",
		passwordHash: "stored-test-password-hash",
		role
	});
}

async function addProvisioningInventory(
	screeningNumber: string,
	sipUsername: string
): Promise<void> {
	await addScreeningNumberToInventory(
		env.nomorescamcalls_db,
		screeningNumber
	);
	await addSipCredentialToInventory(
		env.nomorescamcalls_db,
		sipUsername
	);
}

describe("subscriber provisioning", () => {
	beforeAll(async () => {
		await ensureTestSchema();
	});

	it("creates a recoverable incomplete account and never infers caller identity", async () => {
		const user = await createUser(env.nomorescamcalls_db, {
			firstName: "Personal",
			lastName: "Identity",
			phoneNumber: "+18005551001",
			role: "subscriber"
		});
		const onboarding = await getSubscriberOnboardingStatus(
			env.nomorescamcalls_db,
			user.id
		);

		expect(onboarding.complete).toBe(false);
		expect(onboarding.user.callerFacingBusinessName).toBeNull();
		expect(onboarding.missingRequirements).toContain(
			"caller_facing_business_name"
		);
		await expect(
			provisionSubscriber(env.nomorescamcalls_db, user.id)
		).rejects.toMatchObject({
			code: "onboarding_incomplete",
			missingRequirements: expect.arrayContaining([
				"caller_facing_business_name",
				"required_agreement"
			])
		});
		expect(await findUserById(env.nomorescamcalls_db, user.id))
			.toMatchObject({
				id: user.id,
				screeningNumber: null,
				sipUsername: null,
				coverageStatus: "inactive"
			});
	});

	it("lets the same existing subscriber complete onboarding", async () => {
		const user = await createUser(env.nomorescamcalls_db, {
			phoneNumber: "+18005551002",
			role: "subscriber"
		});
		await acceptCurrentBetaAgreement(env.nomorescamcalls_db, user.id);
		const onboarding = await updateSubscriberOnboarding(
			env.nomorescamcalls_db,
			user.id,
			{
				firstName: "Jordan",
				lastName: "Lee",
				callerFacingBusinessName: "Our Office",
				email: "existing-completion@example.com",
				carrier: "Example Carrier",
				contactMethod: "email",
				password: "new-test-password"
			}
		);

		expect(onboarding.complete).toBe(true);
		expect(onboarding.missingRequirements).toEqual([]);
		expect(onboarding.user).toMatchObject({
			id: user.id,
			firstName: "Jordan",
			lastName: "Lee",
			callerFacingBusinessName: "Our Office",
			setupStatus: "onboarding_complete",
			coverageStatus: "inactive"
		});
	});

	it("requires agreement acceptance and provisions the existing subscriber exactly once", async () => {
		const user = await createCompleteInformationSubscriber("+18005551003");
		await expect(
			provisionSubscriber(env.nomorescamcalls_db, user.id)
		).rejects.toEqual(expect.objectContaining({
			code: "onboarding_incomplete",
			missingRequirements: ["required_agreement"]
		}));

		await acceptCurrentBetaAgreement(env.nomorescamcalls_db, user.id);
		await addProvisioningInventory(
			"+18005552003",
			"test_user_unified_1003"
		);
		const countBefore = await env.nomorescamcalls_db
			.prepare("SELECT COUNT(*) AS count FROM users")
			.first<{ count: number }>();
		const provisioned = await provisionSubscriber(
			env.nomorescamcalls_db,
			user.id
		);
		const countAfter = await env.nomorescamcalls_db
			.prepare("SELECT COUNT(*) AS count FROM users")
			.first<{ count: number }>();

		expect(provisioned).toMatchObject({
			provisioningStatus: "active",
			coverageStatus: "active",
			user: {
				id: user.id,
				screeningNumber: "+18005552003",
				sipUsername: "test_user_unified_1003",
				setupStatus: "provisioned",
				coverageStatus: "active"
			}
		});
		expect(countAfter?.count).toBe(countBefore?.count);
		expect(await findScreeningNumberInInventory(
			env.nomorescamcalls_db,
			"+18005552003"
		)).toMatchObject({ assignedUserId: user.id, status: "assigned" });
		expect(await findSipCredentialInInventory(
			env.nomorescamcalls_db,
			"test_user_unified_1003"
		)).toMatchObject({ assignedUserId: user.id, status: "assigned" });

		const repeated = await provisionSubscriber(
			env.nomorescamcalls_db,
			user.id
		);
		expect(repeated.provisioningStatus).toBe("already_provisioned");
		expect(repeated.user.id).toBe(user.id);
	});

	it("releases a partial reservation and leaves coverage inactive", async () => {
		const user = await createCompleteInformationSubscriber("+18005551004");
		await acceptCurrentBetaAgreement(env.nomorescamcalls_db, user.id);
		await addScreeningNumberToInventory(
			env.nomorescamcalls_db,
			"+18005552004"
		);

		await expect(
			provisionSubscriber(env.nomorescamcalls_db, user.id)
		).rejects.toThrow("No available SIP credentials");
		expect(await findScreeningNumberInInventory(
			env.nomorescamcalls_db,
			"+18005552004"
		)).toMatchObject({ status: "available", assignedUserId: null });
		expect(await findUserById(env.nomorescamcalls_db, user.id))
			.toMatchObject({
				screeningNumber: null,
				sipUsername: null,
				setupStatus: "onboarding_complete",
				coverageStatus: "inactive"
			});
	});

	it.each([
		["beta", "participant", "+18005551005", "+18005552005", "test_user_beta_1005"],
		["future", "subscriber", "+18005551006", "+18005552006", "test_user_future_1006"]
	] as const)(
		"uses the same provisioning service for a %s-origin subscriber",
		async (_source, role, phoneNumber, screeningNumber, sipUsername) => {
			const user = await createCompleteInformationSubscriber(phoneNumber, role);
			await acceptCurrentBetaAgreement(env.nomorescamcalls_db, user.id);
			await addProvisioningInventory(screeningNumber, sipUsername);
			const result = await provisionSubscriber(
				env.nomorescamcalls_db,
				user.id
			);

			expect(result.user).toMatchObject({
				id: user.id,
				role,
				screeningNumber,
				sipUsername,
				coverageStatus: "active"
			});
		}
	);

	it("rejects an inconsistent pre-existing resource state", async () => {
		const user = await createCompleteInformationSubscriber("+18005551007");
		await acceptCurrentBetaAgreement(env.nomorescamcalls_db, user.id);
		await env.nomorescamcalls_db
			.prepare("UPDATE users SET screening_number = ? WHERE id = ?")
			.bind("+18005552007", user.id)
			.run();

		await expect(
			provisionSubscriber(env.nomorescamcalls_db, user.id)
		).rejects.toEqual(
			expect.objectContaining<Partial<SubscriberProvisioningError>>({
				code: "incomplete_provisioning_state"
			})
		);
	});
});
