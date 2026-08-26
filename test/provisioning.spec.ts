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
	ProtectedLineProvisioningError,
	provisionProtectedLine
} from "../src/services/provisioning";
import {
	createAccountLocation,
	createProtectedLine,
	confirmProtectedLineForwarding,
	findProtectedLineById,
	listAccountLocations,
	listProtectedLinesForAccount
} from "../src/services/protectedLines";
import {
	getSubscriberOnboardingStatus,
	refreshSubscriberOnboardingStatus
} from "../src/services/subscriberOnboarding";
import { createUser, findUserById } from "../src/services/users";
import { ensureTestSchema } from "./testSchema";

let fixtureSequence = 0;

function nextFixture(prefix: string): string {
	fixtureSequence += 1;
	return `${prefix}${fixtureSequence.toString().padStart(4, "0")}`;
}

async function createCompleteAccount(
	role: "subscriber" | "participant" = "subscriber"
) {
	const suffix = nextFixture("");
	const account = await createUser(env.nomorescamcalls_db, {
		firstName: "Account",
		lastName: "Owner",
		email: `account-${suffix}@example.com`,
		contactPhoneNumber: `+1800555${suffix}`,
		contactMethod: "email",
		passwordHash: "stored-test-password-hash",
		role
	});
	await acceptCurrentBetaAgreement(env.nomorescamcalls_db, account.id);
	await refreshSubscriberOnboardingStatus(env.nomorescamcalls_db, account.id);
	return account;
}

async function addProvisioningInventory(
	screeningNumber: string,
	sipUsername: string
): Promise<void> {
	await addScreeningNumberToInventory(env.nomorescamcalls_db, screeningNumber);
	await addSipCredentialToInventory(env.nomorescamcalls_db, sipUsername);
}

describe("account, location, and protected-line provisioning", () => {
	beforeAll(async () => {
		await ensureTestSchema();
	});

	it("keeps account contact information separate from protected landline information", async () => {
		const account = await createCompleteAccount();
		const location = await createAccountLocation(
			env.nomorescamcalls_db,
			account.id
		);
		const line = await createProtectedLine(
			env.nomorescamcalls_db,
			account.id,
			location.id,
			{
				protectedPhoneNumber: "+18005554001",
				callerFacingBusinessName: "Our Office",
				carrier: "Example Landline Carrier"
			}
		);

		expect(account.contactPhoneNumber).not.toBe(line.protectedPhoneNumber);
		expect(line).toMatchObject({
			userId: account.id,
			locationId: location.id,
			protectedPhoneNumber: "+18005554001",
			callerFacingBusinessName: "Our Office",
			carrier: "Example Landline Carrier",
			provisioningStatus: "unprovisioned",
			coverageStatus: "inactive"
		});
		expect((await getSubscriberOnboardingStatus(
			env.nomorescamcalls_db,
			account.id
		)).complete).toBe(true);
	});

	it.each(["subscriber", "participant"] as const)(
		"enforces the same six-line location capacity for role %s",
		async (role) => {
			const account = await createCompleteAccount(role);
			const firstLocation = await createAccountLocation(
				env.nomorescamcalls_db,
				account.id
			);
			const secondLocation = await createAccountLocation(
				env.nomorescamcalls_db,
				account.id
			);

			for (let index = 1; index <= 6; index += 1) {
				await createProtectedLine(
					env.nomorescamcalls_db,
					account.id,
					firstLocation.id,
					{
						protectedPhoneNumber: `+1800555${nextFixture("")}`,
						callerFacingBusinessName: `Exact Phrase ${index}`
					}
				);
			}

			await expect(createProtectedLine(
				env.nomorescamcalls_db,
				account.id,
				firstLocation.id,
				{
					protectedPhoneNumber: `+1800555${nextFixture("")}`,
					callerFacingBusinessName: "Seventh Exact Phrase"
				}
			)).rejects.toMatchObject({ code: "location_line_limit_reached" });

			await expect(createProtectedLine(
				env.nomorescamcalls_db,
				account.id,
				secondLocation.id,
				{
					protectedPhoneNumber: `+1800555${nextFixture("")}`,
					callerFacingBusinessName: "Other Location Phrase"
				}
			)).resolves.toMatchObject({ locationId: secondLocation.id });

			expect(await listAccountLocations(
				env.nomorescamcalls_db,
				account.id
			)).toHaveLength(2);
		}
	);

	it("provisions only the selected line and waits for forwarding confirmation", async () => {
		const account = await createCompleteAccount();
		const location = await createAccountLocation(
			env.nomorescamcalls_db,
			account.id
		);
		const firstLine = await createProtectedLine(
			env.nomorescamcalls_db,
			account.id,
			location.id,
			{
				protectedPhoneNumber: "+18005554002",
				callerFacingBusinessName: "First Exact Phrase"
			}
		);
		const secondLine = await createProtectedLine(
			env.nomorescamcalls_db,
			account.id,
			location.id,
			{
				protectedPhoneNumber: "+18005554003",
				callerFacingBusinessName: "our office"
			}
		);
		await addProvisioningInventory(
			"+18005555002",
			"test_line_4002"
		);
		const userCountBefore = await env.nomorescamcalls_db
			.prepare("SELECT COUNT(*) AS count FROM users")
			.first<{ count: number }>();

		const result = await provisionProtectedLine(
			env.nomorescamcalls_db,
			firstLine.id
		);

		expect(result).toMatchObject({
			account: { id: account.id, setupStatus: "onboarding_complete" },
			protectedLine: {
				id: firstLine.id,
				screeningNumber: "+18005555002",
				provisioningStatus: "provisioned",
				coverageStatus: "inactive",
				forwardingStatus: "awaiting_confirmation"
			}
		});
		expect(result.protectedLine).not.toHaveProperty("sipUsername");
		expect(JSON.stringify(result)).not.toContain("test_line_4002");
		expect(result.delivery).toMatchObject({
			channel: "email",
			destination: account.email,
			status: "provider_unavailable"
		});
		expect(await findProtectedLineById(
			env.nomorescamcalls_db,
			firstLine.id
		)).toMatchObject({
			sipUsername: "test_line_4002",
			provisioningStatus: "provisioned",
			coverageStatus: "inactive",
			forwardingStatus: "awaiting_confirmation"
		});
		expect(await findProtectedLineById(
			env.nomorescamcalls_db,
			secondLine.id
		)).toMatchObject({
			screeningNumber: null,
			sipUsername: null,
			provisioningStatus: "unprovisioned",
			coverageStatus: "inactive",
			forwardingStatus: "not_started"
		});
		expect(await findScreeningNumberInInventory(
			env.nomorescamcalls_db,
			"+18005555002"
		)).toMatchObject({
			assignedUserId: account.id,
			assignedProtectedLineId: firstLine.id,
			status: "assigned"
		});
		expect(await findSipCredentialInInventory(
			env.nomorescamcalls_db,
			"test_line_4002"
		)).toMatchObject({
			assignedUserId: account.id,
			assignedProtectedLineId: firstLine.id,
			status: "assigned"
		});
		expect((await env.nomorescamcalls_db
			.prepare("SELECT COUNT(*) AS count FROM users")
			.first<{ count: number }>())?.count).toBe(userCountBefore?.count);

		const repeated = await provisionProtectedLine(
			env.nomorescamcalls_db,
			firstLine.id
		);
		expect(repeated.provisioningStatus).toBe("already_provisioned");
		expect(repeated.protectedLine.coverageStatus).toBe("inactive");

		await expect(confirmProtectedLineForwarding(
			env.nomorescamcalls_db,
			account.id,
			firstLine.id
		)).resolves.toMatchObject({
			id: firstLine.id,
			coverageStatus: "active",
			forwardingStatus: "confirmed"
		});
		expect(await findProtectedLineById(
			env.nomorescamcalls_db,
			secondLine.id
		)).toMatchObject({
			coverageStatus: "inactive",
			forwardingStatus: "not_started"
		});
	});

	it("releases partial resources, marks only that line failed, and permits retry", async () => {
		const account = await createCompleteAccount();
		const location = await createAccountLocation(
			env.nomorescamcalls_db,
			account.id
		);
		const line = await createProtectedLine(
			env.nomorescamcalls_db,
			account.id,
			location.id,
			{
				protectedPhoneNumber: "+18005554004",
				callerFacingBusinessName: "Unchanged Exact Phrase"
			}
		);
		await addScreeningNumberToInventory(
			env.nomorescamcalls_db,
			"+18005555004"
		);

		await expect(provisionProtectedLine(
			env.nomorescamcalls_db,
			line.id
		)).rejects.toThrow("No available SIP credentials");
		expect(await findScreeningNumberInInventory(
			env.nomorescamcalls_db,
			"+18005555004"
		)).toMatchObject({
			status: "available",
			assignedProtectedLineId: null
		});
		expect(await findProtectedLineById(
			env.nomorescamcalls_db,
			line.id
		)).toMatchObject({
			provisioningStatus: "failed",
			coverageStatus: "inactive"
		});

		await addSipCredentialToInventory(
			env.nomorescamcalls_db,
			"test_line_4004"
		);
		await expect(provisionProtectedLine(
			env.nomorescamcalls_db,
			line.id
		)).resolves.toMatchObject({
			coverageStatus: "inactive",
			protectedLine: {
				forwardingStatus: "awaiting_confirmation"
			}
		});
	});

	it("adds later lines without repeating account onboarding or agreement acceptance", async () => {
		const account = await createCompleteAccount();
		const location = await createAccountLocation(
			env.nomorescamcalls_db,
			account.id
		);
		await createProtectedLine(
			env.nomorescamcalls_db,
			account.id,
			location.id,
			{
				protectedPhoneNumber: "+18005554005",
				callerFacingBusinessName: "First Phrase"
			}
		);
		const laterLine = await createProtectedLine(
			env.nomorescamcalls_db,
			account.id,
			location.id,
			{
				protectedPhoneNumber: "+18005554006",
				callerFacingBusinessName: "Second Phrase"
			}
		);

		expect((await getSubscriberOnboardingStatus(
			env.nomorescamcalls_db,
			account.id
		)).complete).toBe(true);
		expect((await listProtectedLinesForAccount(
			env.nomorescamcalls_db,
			account.id
		)).map((line) => line.callerFacingBusinessName)).toEqual([
			"First Phrase",
			"Second Phrase"
		]);
		expect(laterLine.coverageStatus).toBe("inactive");
		expect((await findUserById(env.nomorescamcalls_db, account.id))?.setupStatus)
			.toBe("onboarding_complete");
	});

	it("rejects provisioning when account onboarding is incomplete", async () => {
		const account = await createUser(env.nomorescamcalls_db, {
			contactPhoneNumber: `+1800555${nextFixture("")}`,
			role: "subscriber"
		});
		const location = await createAccountLocation(
			env.nomorescamcalls_db,
			account.id
		);
		const line = await createProtectedLine(
			env.nomorescamcalls_db,
			account.id,
			location.id,
			{
				protectedPhoneNumber: `+1800555${nextFixture("")}`,
				callerFacingBusinessName: "Explicit Phrase"
			}
		);

		await expect(provisionProtectedLine(
			env.nomorescamcalls_db,
			line.id
		)).rejects.toEqual(expect.objectContaining<Partial<ProtectedLineProvisioningError>>({
			code: "onboarding_incomplete",
			missingRequirements: expect.arrayContaining([
				"first_name",
				"required_agreement"
			])
		}));
	});
});
