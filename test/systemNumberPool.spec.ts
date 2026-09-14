import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
	assignOldestReadySystemNumber,
	findSystemNumber,
	getSystemNumberPoolHealth,
	releaseSystemNumberForProtectedLine
} from "../src/services/systemNumberPool";
import { createAccountLocation, createProtectedLine } from "../src/services/protectedLines";
import { createUser } from "../src/services/users";
import { ensureTestSchema } from "./testSchema";
import { addReadySystemNumber } from "./systemNumberFixtures";

let sequence = 0;

async function lineFixture() {
	sequence += 1;
	const suffix = sequence.toString().padStart(4, "0");
	const account = await createUser(env.nomorescamcalls_db, {
		contactPhoneNumber: `+1816555${suffix}`,
		role: "subscriber"
	});
	const location = await createAccountLocation(env.nomorescamcalls_db, account.id);
	return createProtectedLine(env.nomorescamcalls_db, account.id, location.id, {
		protectedPhoneNumber: `+1913555${suffix}`,
		callerFacingBusinessName: `FIFO ${suffix}`
	});
}

describe("System Number Pool", () => {
	beforeAll(ensureTestSchema);
	beforeEach(async () => {
		await env.nomorescamcalls_db.prepare("DELETE FROM system_numbers").run();
	});

	it("assigns the oldest READY System Number first", async () => {
		const line = await lineFixture();
		await addReadySystemNumber("+19135551001", "2026-01-03T00:00:00.000Z");
		await addReadySystemNumber("+19135551002", "2026-01-01T00:00:00.000Z");
		await addReadySystemNumber("+19135551003", "2026-01-02T00:00:00.000Z");

		await expect(assignOldestReadySystemNumber(
			env.nomorescamcalls_db,
			line.id,
			"2026-02-01T00:00:00.000Z"
		)).resolves.toMatchObject({
			phoneNumber: "+19135551002",
			lifecycleState: "assigned",
			protectedLineId: line.id
		});
	});

	it("returns a released System Number to the end of the FIFO pool", async () => {
		const firstLine = await lineFixture();
		const secondLine = await lineFixture();
		await addReadySystemNumber("+19135551101", "2026-01-01T00:00:00.000Z");
		await addReadySystemNumber("+19135551102", "2026-01-02T00:00:00.000Z");
		await assignOldestReadySystemNumber(env.nomorescamcalls_db, firstLine.id);
		await releaseSystemNumberForProtectedLine(
			env.nomorescamcalls_db,
			firstLine.id,
			"2026-03-01T00:00:00.000Z"
		);

		const next = await assignOldestReadySystemNumber(
			env.nomorescamcalls_db,
			secondLine.id
		);
		expect(next.phoneNumber).toBe("+19135551102");
		expect(await findSystemNumber(
			env.nomorescamcalls_db,
			"+19135551101"
		)).toMatchObject({
			lifecycleState: "ready",
			availableSince: "2026-03-01T00:00:00.000Z",
			releasedAt: "2026-03-01T00:00:00.000Z"
		});
	});

	it("never assigns quarantined numbers or duplicates a Protected Line assignment", async () => {
		const line = await lineFixture();
		await env.nomorescamcalls_db.prepare(`
			INSERT INTO system_numbers (
				provider_number_id,
				phone_number,
				lifecycle_state,
				verification_state,
				quarantine_reason
			)
			VALUES ('quarantine-id', '+19135551201', 'quarantined', 'pending', 'test')
		`).run();
		await expect(assignOldestReadySystemNumber(
			env.nomorescamcalls_db,
			line.id
		)).rejects.toThrow("No READY System Numbers");

		await addReadySystemNumber("+19135551202");
		await addReadySystemNumber("+19135551203");
		await assignOldestReadySystemNumber(env.nomorescamcalls_db, line.id);
		await expect(assignOldestReadySystemNumber(
			env.nomorescamcalls_db,
			line.id
		)).rejects.toThrow(/UNIQUE constraint failed/i);
	});

	it("counts only verified READY and unassigned numbers as available", async () => {
		await addReadySystemNumber("+19135551301");
		await env.nomorescamcalls_db.prepare(`
			INSERT INTO system_numbers (
				provider_number_id,
				phone_number,
				lifecycle_state,
				verification_state,
				quarantine_reason
			)
			VALUES
				('pending-id', '+19135551302', 'quarantined', 'pending', 'pending'),
				('failed-id', '+19135551303', 'quarantined', 'failed', 'failed'),
				('legacy-id', '+19135551304', 'ineligible', 'pending', 'legacy')
		`).run();

		await expect(getSystemNumberPoolHealth(env.nomorescamcalls_db)).resolves.toMatchObject({
			total: 4,
			ready: 1,
			quarantined: 2,
			ineligible: 1,
			reorderRequired: true
		});
	});
});
