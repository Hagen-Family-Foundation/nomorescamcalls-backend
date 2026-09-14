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

function applyMigration0030(db) {
	db.exec(
		readFileSync(
			join(
				migrationsDirectory,
				"0030_add_account_locations_and_protected_lines.sql"
			),
			"utf8"
		)
	);
}

function applyMigration0031(db) {
	db.exec(
		readFileSync(
			join(
				migrationsDirectory,
				"0031_add_beta_invitation_and_forwarding_lifecycle.sql"
			),
			"utf8"
		)
	);
}

function applyMigration0032(db) {
	db.exec(
		readFileSync(
			join(
				migrationsDirectory,
				"0032_remove_obsolete_beta_agreement_authority.sql"
			),
			"utf8"
		)
	);
}

function applyMigration0033(db) {
	db.exec(
		readFileSync(
			join(
				migrationsDirectory,
				"0033_retire_beta_invitation_architecture.sql"
			),
			"utf8"
		)
	);
}

function applyMigration0034(db) {
	db.exec(
		readFileSync(
			join(
				migrationsDirectory,
				"0034_add_activation_confirmation_call_state.sql"
			),
			"utf8"
		)
	);
}

function applyMigration0035(db) {
	db.exec(
		readFileSync(
			join(
				migrationsDirectory,
				"0035_replace_screening_inventory_with_system_number_pool.sql"
			),
			"utf8"
		)
	);
}

function applyMigration0036(db) {
	db.exec(
		readFileSync(
			join(
				migrationsDirectory,
				"0036_add_subscriber_delivery_foundation.sql"
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
		"0036_add_subscriber_delivery_foundation.sql"
	);

	assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
	assert.deepEqual(foreignKeyReferencesToUsers(db), [
		{
			table: "account_locations",
			from: "user_id",
			to: "id",
			onDelete: "CASCADE"
		},
		{
			table: "administrative_review_sessions",
			from: "account_user_id",
			to: "id",
			onDelete: "RESTRICT"
		},
		{
			table: "administrative_review_sessions",
			from: "reviewer_user_id",
			to: "id",
			onDelete: "RESTRICT"
		},
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
			table: "customer_communication_deliveries",
			from: "user_id",
			to: "id",
			onDelete: "RESTRICT"
		},
		{
			table: "portal_sessions",
			from: "user_id",
			to: "id",
			onDelete: "CASCADE"
		},
		{
			table: "protected_lines",
			from: "user_id",
			to: "id",
			onDelete: "CASCADE"
		}
	]);

	db.close();
});

test("0036 adds device-owned delivery state without migrating legacy SIP inventory", () => {
	const db = createDatabaseThrough(
		"0035_replace_screening_inventory_with_system_number_pool.sql"
	);
	db.exec(`
		INSERT INTO users (id, phone_number, account_status, status)
		VALUES (96, '+18005550096', 'active', 'active');
		INSERT INTO account_locations (id, user_id) VALUES (960, 96);
		INSERT INTO protected_lines (
			id, user_id, location_id, protected_phone_number,
			caller_facing_business_name, sip_username
		) VALUES (
			961, 96, 960, '+18005550961', 'Delivery Migration Fixture',
			'legacy-inventory-identity'
		);
		INSERT INTO sip_credential_inventory (
			id, sip_username, status, provider_credential_id,
			connection_id, assigned_protected_line_id
		) VALUES (
			962, 'legacy-inventory-identity', 'assigned',
			'legacy-provider-credential', 'legacy-connection', 961
		);
	`);

	applyMigration0036(db);

	assert.equal(
		db.prepare("SELECT COUNT(*) AS count FROM delivery_identities").get().count,
		0
	);
	assert.equal(
		db.prepare("SELECT COUNT(*) AS count FROM device_registrations").get().count,
		0
	);
	assert.equal(
		db.prepare("SELECT COUNT(*) AS count FROM sip_credential_inventory WHERE id = 962").get().count,
		1
	);
	assert.deepEqual(
		{ ...db.prepare("SELECT id, platform, selectable FROM phone_models").get() },
		{ id: "other-model-not-listed", platform: "other", selectable: 1 }
	);
	assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
	db.close();
});

test("0035 replaces legacy inventory with the constrained System Number Pool", () => {
	const db = createDatabaseThrough(
		"0034_add_activation_confirmation_call_state.sql"
	);

	db.exec(`
		INSERT INTO users (
			id,
			phone_number,
			screening_number,
			contact_phone_number
		)
		VALUES (
			95,
			'+18005550095',
			'+19135550095',
			'+18005550195'
		);

		INSERT INTO account_locations (id, user_id)
		VALUES (950, 95);

		INSERT INTO protected_lines (
			id,
			user_id,
			location_id,
			protected_phone_number,
			caller_facing_business_name,
			screening_number
		)
		VALUES (
			951,
			95,
			950,
			'+18005550951',
			'System Number Migration Fixture',
			'+19135550951'
		);

		INSERT INTO evidence_library_calls (
			id,
			call_session_id,
			call_control_id,
			subscriber_screening_number,
			call_started_at,
			evidence_box
		)
		VALUES (
			952,
			'migration-session-952',
			'migration-call-952',
			'+19135550951',
			'2026-09-12T12:00:00.000Z',
			'{}'
		);

		INSERT INTO screening_number_inventory (
			provider_number_id,
			phone_number,
			status,
			assigned_protected_line_id,
			assigned_at
		)
		VALUES
			('legacy-provider-id', '+19135858300', 'available', NULL, NULL),
			('test-provider-id', '+19139562493', 'available', NULL, NULL),
			('ready-candidate-id', '+19135550001', 'available', NULL, NULL),
			('assigned-provider-id', '+19135550951', 'assigned', 951, '2026-09-12T12:00:00.000Z');
	`);

	applyMigration0035(db);

	assert.equal(
		db.prepare("SELECT system_number FROM users WHERE id = 95").get().system_number,
		"+19135550095"
	);
	assert.equal(
		db.prepare("SELECT system_number FROM protected_lines WHERE id = 951").get().system_number,
		"+19135550951"
	);
	assert.equal(
		db.prepare("SELECT subscriber_system_number FROM evidence_library_calls WHERE id = 952").get().subscriber_system_number,
		"+19135550951"
	);
	assert.deepEqual(
		db.prepare(`
			SELECT phone_number, lifecycle_state, protected_line_id, verification_state, quarantine_reason
			FROM system_numbers
			ORDER BY phone_number
		`).all().map((row) => ({ ...row })),
		[
			{
				phone_number: "+19135550001",
				lifecycle_state: "quarantined",
				protected_line_id: null,
				verification_state: "pending",
				quarantine_reason: "provider_normalization_required"
			},
			{
				phone_number: "+19135550951",
				lifecycle_state: "assigned",
				protected_line_id: 951,
				verification_state: "pending",
				quarantine_reason: "assigned_number_requires_provider_verification"
			},
			{
				phone_number: "+19135858300",
				lifecycle_state: "ineligible",
				protected_line_id: null,
				verification_state: "pending",
				quarantine_reason: "legacy_scaminater_configuration"
			},
			{
				phone_number: "+19139562493",
				lifecycle_state: "quarantined",
				protected_line_id: null,
				verification_state: "pending",
				quarantine_reason: "working_test_number"
			}
		]
	);
	assert.equal(
		db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'screening_number_inventory'").get().count,
		0
	);
	assert.equal(
		db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'index' AND name = 'idx_users_system_number'").get().count,
		1
	);
	assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
	db.close();
});

test("0034 adds line-owned confirmation-call state without changing activation", () => {
	const db = createDatabaseThrough(
		"0033_retire_beta_invitation_architecture.sql"
	);

	db.exec(`
		INSERT INTO users (
			id,
			phone_number,
			contact_phone_number,
			account_status,
			setup_status
		)
		VALUES (
			94,
			'+18005550094',
			'+18005550194',
			'active',
			'onboarding_complete'
		);

		INSERT INTO account_locations (id, user_id)
		VALUES (940, 94);

		INSERT INTO protected_lines (
			id,
			user_id,
			location_id,
			protected_phone_number,
			caller_facing_business_name,
			screening_number,
			sip_username,
			provisioning_status,
			forwarding_status,
			coverage_status,
			activated_at
		)
		VALUES (
			941,
			94,
			940,
			'+18005550941',
			'Migration Confirmation Line',
			'+18005551941',
			'migration_confirmation_941',
			'provisioned',
			'confirmed',
			'active',
			'2026-09-12T12:00:00.000Z'
		);
	`);

	applyMigration0034(db);

	assert.deepEqual(
		{ ...db.prepare(`
			SELECT
				coverage_status,
				forwarding_status,
				activation_confirmation_call_status,
				activation_confirmation_call_control_id
			FROM protected_lines
			WHERE id = 941
		`).get() },
		{
			coverage_status: "active",
			forwarding_status: "confirmed",
			activation_confirmation_call_status: "not_started",
			activation_confirmation_call_control_id: null
		}
	);
	assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
	db.close();
});

test("0033 removes invitation state and preserves forwarding delivery history", () => {
	const db = createDatabaseThrough(
		"0032_remove_obsolete_beta_agreement_authority.sql"
	);

	db.exec(`
		INSERT INTO users (
			id,
			phone_number,
			contact_phone_number,
			email,
			role
		)
		VALUES
			(92, '+18005550092', '+18005550092', 'admin-92@example.com', 'administrator'),
			(93, '+18005550093', '+18005550093', 'customer-93@example.com', 'participant');

		INSERT INTO account_locations (id, user_id)
		VALUES (930, 93);

		INSERT INTO protected_lines (
			id,
			user_id,
			location_id,
			protected_phone_number,
			caller_facing_business_name
		)
		VALUES (931, 93, 930, '+18005550931', 'Migration Test Line');

		INSERT INTO beta_invitations (
			id,
			response_token,
			email_contact,
			selected_channel,
			selected_destination,
			created_by_user_id,
			issued_at,
			awaiting_response_at
		)
		VALUES (
			940,
			'synthetic-response-token',
			'customer-93@example.com',
			'email',
			'customer-93@example.com',
			92,
			'2026-08-01T00:00:00.000Z',
			'2026-08-01T00:00:00.000Z'
		);

		INSERT INTO beta_invite_codes (
			code,
			invitation_id,
			created_by_user_id
		)
		VALUES ('SYNTHETIC-RETIRED-CODE', 940, 92);

		INSERT INTO customer_communication_deliveries (
			id,
			invitation_id,
			purpose,
			channel,
			destination,
			message_body,
			status,
			created_at,
			updated_at
		)
		VALUES (
			950,
			940,
			'beta_invitation',
			'email',
			'customer-93@example.com',
			'Synthetic retired message',
			'provider_unavailable',
			'2026-08-01T00:00:00.000Z',
			'2026-08-01T00:00:00.000Z'
		);

		INSERT INTO customer_communication_deliveries (
			id,
			user_id,
			protected_line_id,
			purpose,
			channel,
			destination,
			message_body,
			status,
			provider,
			provider_message_id,
			created_at,
			updated_at
		)
		VALUES (
			951,
			93,
			931,
			'forwarding_instructions',
			'sms',
			'+18005550093',
			'Synthetic exact-line instructions',
			'sent',
			'telnyx',
			'synthetic-provider-id',
			'2026-08-01T00:01:00.000Z',
			'2026-08-01T00:01:00.000Z'
		);

		INSERT INTO beta_agreement_acceptances (
			user_id,
			agreement_version,
			accepted_at
		)
		VALUES (93, 'v1', '2026-08-01T00:02:00.000Z');
	`);

	applyMigration0033(db);

	const remainingTables = db.prepare(`
		SELECT name
		FROM sqlite_master
		WHERE type = 'table'
			AND name IN ('beta_invitations', 'beta_invite_codes')
	`).all();
	assert.deepEqual(remainingTables, []);
	assert.equal(
		db.prepare("SELECT COUNT(*) AS count FROM customer_communication_deliveries").get().count,
		1
	);
	assert.deepEqual(
		{ ...db.prepare(`
			SELECT
				user_id,
				protected_line_id,
				purpose,
				provider_message_id
			FROM customer_communication_deliveries
		`).get() },
		{
			user_id: 93,
			protected_line_id: 931,
			purpose: "forwarding_instructions",
			provider_message_id: "synthetic-provider-id"
		}
	);
	assert.equal(
		db.prepare("SELECT COUNT(*) AS count FROM users WHERE id = 93").get().count,
		1
	);
	assert.equal(
		db.prepare("SELECT COUNT(*) AS count FROM protected_lines WHERE id = 931").get().count,
		1
	);
	assert.equal(
		db.prepare("SELECT COUNT(*) AS count FROM beta_agreement_acceptances WHERE user_id = 93").get().count,
		1
	);
	assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);

	db.close();
});

test("0032 removes the obsolete agreement authority and preserves acceptance history", () => {
	const db = createDatabaseThrough(
		"0031_add_beta_invitation_and_forwarding_lifecycle.sql"
	);

	db.exec(`
		INSERT INTO users (id, phone_number, role)
		VALUES (92, '+18005550092', 'subscriber');

		INSERT INTO beta_agreement_acceptances (
			user_id,
			agreement_version,
			accepted_at
		)
		VALUES (92, 'v1', '2026-07-19T12:00:00.000Z');
	`);

	applyMigration0032(db);

	assert.equal(
		db.prepare(`
			SELECT COUNT(*) AS count
			FROM sqlite_master
			WHERE type = 'table'
				AND name = 'beta_agreements'
		`).get().count,
		0
	);
	assert.deepEqual(
		{ ...db.prepare(`
			SELECT user_id, agreement_version, accepted_at
			FROM beta_agreement_acceptances
			WHERE user_id = 92
		`).get() },
		{
			user_id: 92,
			agreement_version: "v1",
			accepted_at: "2026-07-19T12:00:00.000Z"
		}
	);
	assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);

	db.close();
});

test("0031 preserves existing rows without inferring SMS capability or forwarding confirmation", () => {
	const db = createDatabaseThrough(
		"0030_add_account_locations_and_protected_lines.sql"
	);

	db.exec(`
		INSERT INTO users (id, phone_number, email, role)
		VALUES
			(90, '+18005550090', 'creator-90@example.com', 'administrator'),
			(91, '+18005550091', 'customer-91@example.com', 'subscriber');

		INSERT INTO account_locations (id, user_id)
		VALUES (910, 91);

		INSERT INTO protected_lines (
			id,
			user_id,
			location_id,
			protected_phone_number,
			caller_facing_business_name,
			screening_number,
			sip_username,
			provisioning_status,
			coverage_status
		)
		VALUES (
			911,
			91,
			910,
			'+18005550911',
			'Existing Protected Line',
			'+18005551911',
			'test_user_existing_911',
			'provisioned',
			'active'
		);

	`);

	applyMigration0031(db);

	assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
	assert.deepEqual(
		{ ...db.prepare(`
			SELECT sms_contact_number, sms_capable
			FROM users
			WHERE id = 91
		`).get() },
		{ sms_contact_number: null, sms_capable: 0 }
	);
	assert.deepEqual(
		{ ...db.prepare(`
			SELECT
				forwarding_status,
				forwarding_confirmed_at,
				coverage_status
			FROM protected_lines
			WHERE id = 911
		`).get() },
		{
			forwarding_status: "not_started",
			forwarding_confirmed_at: null,
			coverage_status: "active"
		}
	);
	db.close();
});

test("0030 review audit foreign keys preserve reviewer, account, and line identity", () => {
	const db = createDatabaseThrough(
		"0030_add_account_locations_and_protected_lines.sql"
	);

	db.exec(`
		INSERT INTO users (id, phone_number, role)
		VALUES
			(80, '+18005550080', 'administrator'),
			(81, '+18005550081', 'subscriber'),
			(82, '+18005550082', 'subscriber');

		INSERT INTO account_locations (id, user_id)
		VALUES (810, 81), (820, 82);

		INSERT INTO protected_lines (
			id,
			user_id,
			location_id,
			protected_phone_number,
			caller_facing_business_name
		)
		VALUES
			(811, 81, 810, '+18005550811', 'Account 81 Line'),
			(821, 82, 820, '+18005550821', 'Account 82 Line');

		INSERT INTO administrative_review_sessions (
			id,
			reviewer_user_id,
			reviewer_role,
			account_user_id,
			initial_protected_line_id,
			started_at
		)
		VALUES (
			'review-session-81',
			80,
			'administrator',
			81,
			811,
			'2026-08-26T12:00:00.000Z'
		);

		INSERT INTO administrative_review_events (
			review_session_id,
			reviewer_user_id,
			account_user_id,
			protected_line_id,
			event_type,
			resource_section,
			action,
			created_at
		)
		VALUES (
			'review-session-81',
			80,
			81,
			811,
			'read',
			'account_family',
			'review_started',
			'2026-08-26T12:00:00.000Z'
		);
	`);

	assert.throws(
		() => db.exec(`
			INSERT INTO administrative_review_events (
				review_session_id,
				reviewer_user_id,
				account_user_id,
				protected_line_id,
				event_type,
				resource_section,
				action,
				created_at
			)
			VALUES (
				'review-session-81',
				80,
				81,
				821,
				'read',
				'protected_line',
				'section_viewed',
				'2026-08-26T12:01:00.000Z'
			)
		`),
		/FOREIGN KEY constraint failed/
	);
	assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);

	db.close();
});

test("0030 preserves legacy rows without guessing normalized line mappings", () => {
	const db = createDatabaseThrough(
		"0029_unify_subscriber_lifecycle_defaults.sql"
	);

	db.exec(`
		INSERT INTO users (
			id,
			phone_number,
			screening_number,
			sip_username,
			caller_facing_business_name,
			carrier,
			coverage_status
		)
		VALUES (
			6,
			'+18005550606',
			'+18005551606',
			'test_user_fixture_6',
			'Synthetic Legacy Identity',
			'Synthetic Carrier',
			'active'
		);

		INSERT INTO screening_number_inventory (
			phone_number,
			status,
			assigned_user_id
		)
		VALUES ('+18005551606', 'assigned', 6);

		INSERT INTO sip_credential_inventory (
			sip_username,
			status,
			assigned_user_id
		)
		VALUES ('test_user_fixture_6', 'assigned', 6);
	`);

	applyMigration0030(db);

	assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
	assert.equal(
		db.prepare("SELECT contact_phone_number FROM users WHERE id = 6").get()
			.contact_phone_number,
		null
	);
	assert.equal(
		db.prepare("SELECT COUNT(*) AS count FROM account_locations").get().count,
		0
	);
	assert.equal(
		db.prepare("SELECT COUNT(*) AS count FROM protected_lines").get().count,
		0
	);
	assert.deepEqual(
		{ ...db.prepare(`
			SELECT assigned_user_id, assigned_protected_line_id
			FROM screening_number_inventory
			WHERE phone_number = '+18005551606'
		`).get() },
		{ assigned_user_id: 6, assigned_protected_line_id: null }
	);
	assert.deepEqual(
		{ ...db.prepare(`
			SELECT assigned_user_id, assigned_protected_line_id
			FROM sip_credential_inventory
			WHERE sip_username = 'test_user_fixture_6'
		`).get() },
		{ assigned_user_id: 6, assigned_protected_line_id: null }
	);

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
