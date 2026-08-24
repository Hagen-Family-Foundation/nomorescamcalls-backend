import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const migrationsDirectory = join(repositoryRoot, "migrations");
const migrationFiles = readdirSync(migrationsDirectory)
	.filter((name) => /^\d{4}_.+\.sql$/.test(name))
	.sort();

function createDatabaseThrough(lastMigration) {
	const db = new DatabaseSync(":memory:");
	db.exec("PRAGMA foreign_keys = ON");

	for (const migrationFile of migrationFiles) {
		if (migrationFile > lastMigration) {
			break;
		}

		db.exec(
			readFileSync(
				join(migrationsDirectory, migrationFile),
				"utf8"
			)
		);
	}

	return db;
}

function applyMigration0029(db) {
	db.exec(
		readFileSync(
			join(
				migrationsDirectory,
				"0029_unify_subscriber_lifecycle_defaults.sql"
			),
			"utf8"
		)
	);
}

function foreignKeyReferencesToUsers(db) {
	const tables = db
		.prepare(`
			SELECT name
			FROM sqlite_master
			WHERE type = 'table'
				AND name NOT LIKE 'sqlite_%'
			ORDER BY name
		`)
		.all();
	const references = [];

	for (const { name } of tables) {
		for (const foreignKey of db
			.prepare(`PRAGMA foreign_key_list("${name}")`)
			.all()) {
			if (foreignKey.table === "users") {
				references.push({
					table: name,
					from: foreignKey.from,
					to: foreignKey.to,
					onDelete: foreignKey.on_delete
				});
			}
		}
	}

	return references.sort((left, right) =>
		`${left.table}.${left.from}`.localeCompare(
			`${right.table}.${right.from}`
		)
	);
}

test("the complete migration chain applies with clean foreign keys", () => {
	const db = createDatabaseThrough(
		"0029_unify_subscriber_lifecycle_defaults.sql"
	);

	assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
	assert.deepEqual(foreignKeyReferencesToUsers(db), [
		{
			table: "beta_agreement_acceptances",
			from: "user_id",
			to: "id",
			onDelete: "RESTRICT"
		},
		{
			table: "beta_feedback",
			from: "user_id",
			to: "id",
			onDelete: "RESTRICT"
		},
		{
			table: "beta_invite_codes",
			from: "created_by_user_id",
			to: "id",
			onDelete: "SET NULL"
		},
		{
			table: "beta_invite_codes",
			from: "redeemed_by_user_id",
			to: "id",
			onDelete: "SET NULL"
		},
		{
			table: "portal_sessions",
			from: "user_id",
			to: "id",
			onDelete: "CASCADE"
		}
	]);

	db.close();
});

test("0029 preserves production-like users, child rows, and inventory ownership", () => {
	const db = createDatabaseThrough(
		"0028_add_caller_facing_business_name.sql"
	);

	db.exec(`
		INSERT INTO users (
			id,
			phone_number,
			screening_number,
			sip_username,
			email,
			role,
			account_status,
			setup_status,
			status,
			coverage_status,
			caller_facing_business_name
		)
		VALUES
			(
				6,
				'+18005550606',
				'+18005551606',
				'test_user_fixture_6',
				'fixture-6@example.com',
				'participant',
				'active',
				'account_created',
				'active',
				'active',
				NULL
			),
			(
				7,
				'+18005550707',
				NULL,
				NULL,
				'fixture-7@example.com',
				'participant',
				'active',
				'account_created',
				'active',
				'pending',
				NULL
			);

		INSERT INTO call_events (
			id,
			user_id,
			caller_hash,
			decision,
			score,
			reason
		)
		VALUES (600, 7, 'synthetic-caller-hash', 'divert', 60, 'test');

		INSERT INTO beta_invite_codes (
			code,
			created_by_user_id,
			redeemed_by_user_id
		)
		VALUES ('MIGRATION-REFERENCE', 6, 7);

		INSERT INTO portal_sessions (
			user_id,
			token_hash,
			expires_at
		)
		VALUES (6, 'synthetic-token-hash', '2099-01-01T00:00:00Z');

		INSERT INTO beta_agreement_acceptances (
			user_id,
			agreement_version
		)
		VALUES (6, 'v1');

		INSERT INTO beta_feedback (
			user_id,
			category,
			related_call_event_id,
			comments
		)
		VALUES (7, 'setup', 600, 'Synthetic migration fixture');

		INSERT INTO screening_number_inventory (
			phone_number,
			status,
			assigned_user_id,
			assigned_at
		)
		VALUES (
			'+18005551606',
			'assigned',
			6,
			'2026-01-01T00:00:00Z'
		);

		INSERT INTO sip_credential_inventory (
			sip_username,
			status,
			assigned_user_id,
			assigned_at
		)
		VALUES (
			'test_user_fixture_6',
			'assigned',
			6,
			'2026-01-01T00:00:00Z'
		);
	`);

	const usersBefore = db
		.prepare(`
			SELECT
				id,
				screening_number,
				sip_username,
				setup_status,
				coverage_status,
				caller_facing_business_name
			FROM users
			ORDER BY id
		`)
		.all();

	applyMigration0029(db);

	assert.deepEqual(
		db.prepare(`
			SELECT
				id,
				screening_number,
				sip_username,
				setup_status,
				coverage_status,
				caller_facing_business_name
			FROM users
			ORDER BY id
		`).all(),
		usersBefore
	);
	assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
	assert.equal(
		db.prepare(`
			SELECT COUNT(*) AS count
			FROM beta_invite_codes
			WHERE created_by_user_id = 6
				AND redeemed_by_user_id = 7
		`).get().count,
		1
	);
	assert.equal(
		db.prepare(`
			SELECT COUNT(*) AS count
			FROM portal_sessions
			WHERE user_id = 6
		`).get().count,
		1
	);
	assert.equal(
		db.prepare(`
			SELECT COUNT(*) AS count
			FROM beta_agreement_acceptances
			WHERE user_id = 6
		`).get().count,
		1
	);
	assert.equal(
		db.prepare(`
			SELECT COUNT(*) AS count
			FROM beta_feedback
			WHERE user_id = 7
		`).get().count,
		1
	);
	assert.deepEqual(
		{ ...db.prepare(`
			SELECT status, assigned_user_id
			FROM screening_number_inventory
			WHERE phone_number = '+18005551606'
		`).get() },
		{ status: "assigned", assigned_user_id: 6 }
	);
	assert.deepEqual(
		{ ...db.prepare(`
			SELECT status, assigned_user_id
			FROM sip_credential_inventory
			WHERE sip_username = 'test_user_fixture_6'
		`).get() },
		{ status: "assigned", assigned_user_id: 6 }
	);

	db.close();
});

test("the production foreign-key graph rejects dropping the users parent table", () => {
	const db = createDatabaseThrough(
		"0028_add_caller_facing_business_name.sql"
	);

	db.exec(`
		INSERT INTO users (id, phone_number)
		VALUES (60, '+18005550060');

		INSERT INTO beta_agreement_acceptances (
			user_id,
			agreement_version
		)
		VALUES (60, 'v1');
	`);

	assert.throws(
		() => db.exec("DROP TABLE users"),
		/FOREIGN KEY constraint failed/
	);
	assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
	db.close();
});
