import {
	describe,
	expect,
	it,
	vi
} from "vitest";
import {
	provisionSubscriber
} from "../src/services/provisioning";

describe("subscriber provisioning", () => {
	it("rejects an existing account that has not selected a caller-facing business name", async () => {
		const row = {
			id: 1,
			first_name: "Account",
			last_name: "Owner",
			caller_facing_business_name: null,
			email: "owner@example.com",
			phone_number: "+15550001001",
			screening_number: null,
			sip_username: null,
			carrier: null,
			contact_method: null,
			role: "participant",
			account_status: "active",
			setup_status: "registration_information_completed",
			status: "active",
			coverage_status: "inactive"
		};
		const first = vi.fn(async () => row);
		const db = {
			prepare: vi.fn(() => ({
				bind: vi.fn(() => ({ first }))
			}))
		} as unknown as D1Database;

		await expect(
			provisionSubscriber(db, 1)
		).rejects.toThrow(
			"Caller-facing business name is required before subscriber provisioning"
		);
		expect(first).toHaveBeenCalledOnce();
	});
});
