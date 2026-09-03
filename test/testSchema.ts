import { env } from "cloudflare:test";

export async function ensureTestSchema(): Promise<void> {
	await env.nomorescamcalls_db
		.prepare(`
			CREATE TABLE IF NOT EXISTS users (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				first_name TEXT,
				last_name TEXT,
				caller_facing_business_name TEXT,
				carrier TEXT,
				contact_method TEXT,
				password_hash TEXT,
				role TEXT NOT NULL DEFAULT 'subscriber',
				account_status TEXT NOT NULL DEFAULT 'active',
				setup_status TEXT NOT NULL DEFAULT 'onboarding_incomplete',
				email TEXT UNIQUE,
				contact_phone_number TEXT,
				sms_contact_number TEXT,
				sms_capable INTEGER NOT NULL DEFAULT 0
					CHECK (sms_capable IN (0, 1))
					CHECK (
						sms_capable = 0
						OR (
							sms_contact_number IS NOT NULL
							AND length(trim(sms_contact_number)) > 0
						)
					),
				phone_number TEXT NOT NULL UNIQUE,
				screening_number TEXT UNIQUE,
				sip_username TEXT UNIQUE,
				status TEXT NOT NULL DEFAULT 'active',
				coverage_status TEXT NOT NULL DEFAULT 'inactive',
				created_at TEXT DEFAULT CURRENT_TIMESTAMP
			)
		`)
		.run();

	const userColumns = await env.nomorescamcalls_db
		.prepare("PRAGMA table_info(users)")
		.all<{ name: string }>();
	if (!userColumns.results.some((column) =>
		column.name === "caller_facing_business_name"
	)) {
		await env.nomorescamcalls_db
			.prepare("ALTER TABLE users ADD COLUMN caller_facing_business_name TEXT")
			.run();
	}
	if (!userColumns.results.some((column) =>
		column.name === "contact_phone_number"
	)) {
		await env.nomorescamcalls_db
			.prepare("ALTER TABLE users ADD COLUMN contact_phone_number TEXT")
			.run();
	}
	if (!userColumns.results.some((column) =>
		column.name === "sms_contact_number"
	)) {
		await env.nomorescamcalls_db
			.prepare("ALTER TABLE users ADD COLUMN sms_contact_number TEXT")
			.run();
	}
	if (!userColumns.results.some((column) =>
		column.name === "sms_capable"
	)) {
		await env.nomorescamcalls_db
			.prepare("ALTER TABLE users ADD COLUMN sms_capable INTEGER NOT NULL DEFAULT 0")
			.run();
	}

	await env.nomorescamcalls_db
		.prepare(`
			CREATE TABLE IF NOT EXISTS account_locations (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id INTEGER NOT NULL,
				created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
				UNIQUE(id, user_id)
			)
		`)
		.run();

	await env.nomorescamcalls_db
		.prepare(`
			CREATE TABLE IF NOT EXISTS protected_lines (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id INTEGER NOT NULL,
				location_id INTEGER NOT NULL,
				protected_phone_number TEXT NOT NULL UNIQUE,
				caller_facing_business_name TEXT NOT NULL,
				carrier TEXT,
				screening_number TEXT UNIQUE,
				sip_username TEXT UNIQUE,
				provisioning_status TEXT NOT NULL DEFAULT 'unprovisioned',
				coverage_status TEXT NOT NULL DEFAULT 'inactive',
				forwarding_status TEXT NOT NULL DEFAULT 'not_started',
				resources_provisioned_at TEXT,
				forwarding_instructions_created_at TEXT,
				forwarding_confirmed_at TEXT,
				activated_at TEXT,
				created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
				updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
				FOREIGN KEY (location_id, user_id)
					REFERENCES account_locations(id, user_id)
					ON DELETE CASCADE
			)
		`)
		.run();

	const protectedLineColumns = await env.nomorescamcalls_db
		.prepare("PRAGMA table_info(protected_lines)")
		.all<{ name: string }>();
	for (const [column, definition] of [
		["forwarding_status", "TEXT NOT NULL DEFAULT 'not_started'"],
		["resources_provisioned_at", "TEXT"],
		["forwarding_instructions_created_at", "TEXT"],
		["forwarding_confirmed_at", "TEXT"],
		["activated_at", "TEXT"]
	] as const) {
		if (!protectedLineColumns.results.some((entry) => entry.name === column)) {
			await env.nomorescamcalls_db
				.prepare(`ALTER TABLE protected_lines ADD COLUMN ${column} ${definition}`)
				.run();
		}
	}

	await env.nomorescamcalls_db
		.prepare(`
			CREATE UNIQUE INDEX IF NOT EXISTS idx_test_protected_lines_id_user
			ON protected_lines(id, user_id)
		`)
		.run();

	await env.nomorescamcalls_db
		.prepare(`
			CREATE TABLE IF NOT EXISTS administrative_review_sessions (
				id TEXT PRIMARY KEY,
				reviewer_user_id INTEGER NOT NULL,
				reviewer_role TEXT NOT NULL,
				account_user_id INTEGER NOT NULL,
				initial_protected_line_id INTEGER,
				started_at TEXT NOT NULL,
				ended_at TEXT,
				FOREIGN KEY (reviewer_user_id)
					REFERENCES users(id)
					ON DELETE RESTRICT,
				FOREIGN KEY (account_user_id)
					REFERENCES users(id)
					ON DELETE RESTRICT,
				FOREIGN KEY (initial_protected_line_id, account_user_id)
					REFERENCES protected_lines(id, user_id)
					ON DELETE RESTRICT,
				UNIQUE(id, reviewer_user_id, account_user_id)
			)
		`)
		.run();

	await env.nomorescamcalls_db
		.prepare(`
			CREATE TABLE IF NOT EXISTS administrative_review_events (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				review_session_id TEXT NOT NULL,
				reviewer_user_id INTEGER NOT NULL,
				account_user_id INTEGER NOT NULL,
				protected_line_id INTEGER,
				event_type TEXT NOT NULL,
				resource_section TEXT NOT NULL,
				action TEXT NOT NULL,
				field_name TEXT,
				prior_value TEXT,
				resulting_value TEXT,
				created_at TEXT NOT NULL,
				FOREIGN KEY (
					review_session_id,
					reviewer_user_id,
					account_user_id
				)
					REFERENCES administrative_review_sessions(
						id,
						reviewer_user_id,
						account_user_id
					)
					ON DELETE RESTRICT,
				FOREIGN KEY (protected_line_id, account_user_id)
					REFERENCES protected_lines(id, user_id)
					ON DELETE RESTRICT
			)
		`)
		.run();

	await env.nomorescamcalls_db
		.prepare(`
			CREATE TABLE IF NOT EXISTS beta_invitations (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				response_token TEXT NOT NULL UNIQUE,
				sms_contact_number TEXT,
				sms_capable INTEGER NOT NULL DEFAULT 0,
				email_contact TEXT,
				selected_channel TEXT NOT NULL,
				selected_destination TEXT NOT NULL,
				status TEXT NOT NULL DEFAULT 'awaiting_response',
				created_by_user_id INTEGER NOT NULL,
				issued_at TEXT NOT NULL,
				awaiting_response_at TEXT NOT NULL,
				response_received_at TEXT,
				accepted_at TEXT,
				credential_issued_at TEXT,
				redeemed_at TEXT,
				expires_at TEXT,
				created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
				updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
		`)
		.run();

	await env.nomorescamcalls_db
		.prepare(`
			CREATE TABLE IF NOT EXISTS beta_invite_codes (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				code TEXT NOT NULL UNIQUE,
				status TEXT NOT NULL DEFAULT 'active',
				expires_at TEXT,
				max_uses INTEGER NOT NULL DEFAULT 1,
				use_count INTEGER NOT NULL DEFAULT 0,
				created_by_user_id INTEGER,
				redeemed_by_user_id INTEGER,
				invitation_id INTEGER,
				created_at TEXT DEFAULT CURRENT_TIMESTAMP,
				updated_at TEXT DEFAULT CURRENT_TIMESTAMP
			)
		`)
		.run();

	const inviteCodeColumns = await env.nomorescamcalls_db
		.prepare("PRAGMA table_info(beta_invite_codes)")
		.all<{ name: string }>();
	if (!inviteCodeColumns.results.some((column) =>
		column.name === "invitation_id"
	)) {
		await env.nomorescamcalls_db
			.prepare("ALTER TABLE beta_invite_codes ADD COLUMN invitation_id INTEGER")
			.run();
	}

	await env.nomorescamcalls_db
		.prepare(`
			CREATE TABLE IF NOT EXISTS customer_communication_deliveries (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				invitation_id INTEGER,
				user_id INTEGER,
				protected_line_id INTEGER,
				purpose TEXT NOT NULL,
				channel TEXT NOT NULL,
				destination TEXT NOT NULL,
				subject TEXT,
				message_body TEXT NOT NULL,
				status TEXT NOT NULL,
				provider TEXT,
				provider_message_id TEXT,
				failure_reason TEXT,
				attempted_at TEXT,
				sent_at TEXT,
				created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
				updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
		`)
		.run();

	await env.nomorescamcalls_db
		.prepare(`
			CREATE TABLE IF NOT EXISTS portal_sessions (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id INTEGER NOT NULL,
				token_hash TEXT NOT NULL UNIQUE,
				expires_at TEXT NOT NULL,
				last_used_at TEXT,
				revoked_at TEXT,
				created_at TEXT DEFAULT CURRENT_TIMESTAMP
			)
		`)
		.run();

	await env.nomorescamcalls_db
		.prepare(`
			CREATE TABLE IF NOT EXISTS block_list (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id INTEGER,
				phone_number TEXT NOT NULL,
				reason TEXT NOT NULL,
				created_at TEXT DEFAULT CURRENT_TIMESTAMP,
				UNIQUE(user_id, phone_number)
			)
		`)
		.run();

	await env.nomorescamcalls_db
		.prepare(`
			CREATE TABLE IF NOT EXISTS allow_list (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id INTEGER,
				phone_number TEXT NOT NULL,
				reason TEXT NOT NULL,
				created_at TEXT DEFAULT CURRENT_TIMESTAMP,
				UNIQUE(user_id, phone_number)
			)
		`)
		.run();

	await env.nomorescamcalls_db
		.prepare(`
			CREATE TABLE IF NOT EXISTS caller_reputation (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				caller_hash TEXT NOT NULL UNIQUE,
				status TEXT NOT NULL DEFAULT 'unknown',
				risk_score INTEGER NOT NULL DEFAULT 0,
				attempt_count INTEGER NOT NULL DEFAULT 1,
				first_seen TEXT DEFAULT CURRENT_TIMESTAMP,
				last_seen TEXT DEFAULT CURRENT_TIMESTAMP
			)
		`)
		.run();

	await env.nomorescamcalls_db
		.prepare(`
			CREATE TABLE IF NOT EXISTS confirmed_scam_numbers (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				caller_number TEXT NOT NULL UNIQUE,
				reason TEXT NOT NULL,
				evidence_level TEXT NOT NULL DEFAULT 'high',
				risk_score INTEGER NOT NULL DEFAULT 95,
				attempt_count INTEGER NOT NULL DEFAULT 1,
				first_seen TEXT DEFAULT CURRENT_TIMESTAMP,
				last_seen TEXT DEFAULT CURRENT_TIMESTAMP
			)
		`)
		.run();

	await env.nomorescamcalls_db
		.prepare(`
			CREATE TABLE IF NOT EXISTS call_events (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id INTEGER,
				protected_line_id INTEGER,
				caller_hash TEXT NOT NULL,
				decision TEXT NOT NULL,
				score INTEGER NOT NULL,
				reason TEXT NOT NULL,
				created_at TEXT DEFAULT CURRENT_TIMESTAMP
			)
		`)
		.run();

	await env.nomorescamcalls_db
		.prepare(`
			CREATE TABLE IF NOT EXISTS scam_signals (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				caller_hash TEXT NOT NULL,
				signal_type TEXT NOT NULL,
				confidence REAL NOT NULL DEFAULT 1.0,
				source TEXT NOT NULL DEFAULT 'system',
				created_at TEXT DEFAULT CURRENT_TIMESTAMP
			)
		`)
		.run();

	await env.nomorescamcalls_db
		.prepare(`
			CREATE TABLE IF NOT EXISTS telnyx_challenges (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id INTEGER,
				call_session_id TEXT NOT NULL UNIQUE,
				call_control_id TEXT NOT NULL,
				expected_input TEXT NOT NULL,
				status TEXT NOT NULL DEFAULT 'pending',
				created_at TEXT DEFAULT CURRENT_TIMESTAMP,
				updated_at TEXT DEFAULT CURRENT_TIMESTAMP
			)
		`)
		.run();

	await env.nomorescamcalls_db
		.prepare(`
			CREATE TABLE IF NOT EXISTS telnyx_webhook_events (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				event_type TEXT NOT NULL,
				call_control_id TEXT,
				call_session_id TEXT,
				caller_hash TEXT,
				from_number_hash TEXT,
				to_number TEXT,
				planned_action TEXT,
				planned_command TEXT,
				approved_sip_username TEXT,
				created_at TEXT DEFAULT CURRENT_TIMESTAMP
			)
		`)
		.run();

	await env.nomorescamcalls_db
		.prepare(`
			CREATE TABLE IF NOT EXISTS screening_number_inventory (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				phone_number TEXT NOT NULL UNIQUE,
				status TEXT NOT NULL DEFAULT 'available',
				assigned_user_id INTEGER,
				assigned_protected_line_id INTEGER,
				assigned_at TEXT,
				provider TEXT NOT NULL DEFAULT 'telnyx',
				provider_number_id TEXT,
				voice_application_id TEXT,
				connection_id TEXT,
				last_synced_at TEXT,
				created_at TEXT DEFAULT CURRENT_TIMESTAMP
			)
		`)
		.run();

	await env.nomorescamcalls_db
		.prepare(`
			CREATE TABLE IF NOT EXISTS sip_credential_inventory (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				sip_username TEXT NOT NULL UNIQUE,
				status TEXT NOT NULL DEFAULT 'available',
				assigned_user_id INTEGER,
				assigned_protected_line_id INTEGER,
				assigned_at TEXT,
				provider TEXT NOT NULL DEFAULT 'telnyx',
				provider_credential_id TEXT,
				connection_id TEXT,
				last_synced_at TEXT,
				created_at TEXT DEFAULT CURRENT_TIMESTAMP
			)
		`)
		.run();

	for (const [table, column] of [
		["screening_number_inventory", "assigned_protected_line_id"],
		["sip_credential_inventory", "assigned_protected_line_id"],
		["call_events", "protected_line_id"]
	] as const) {
		const columns = await env.nomorescamcalls_db
			.prepare(`PRAGMA table_info(${table})`)
			.all<{ name: string }>();
		if (!columns.results.some((entry) => entry.name === column)) {
			await env.nomorescamcalls_db
				.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} INTEGER`)
				.run();
		}
	}

	await env.nomorescamcalls_db
		.prepare(`
			CREATE INDEX IF NOT EXISTS idx_screening_number_inventory_status
			ON screening_number_inventory(status)
		`)
		.run();

	await env.nomorescamcalls_db
		.prepare(`
			CREATE INDEX IF NOT EXISTS idx_screening_number_inventory_provider
			ON screening_number_inventory(provider)
		`)
		.run();

	await env.nomorescamcalls_db
		.prepare(`
			CREATE INDEX IF NOT EXISTS idx_screening_number_inventory_provider_number_id
			ON screening_number_inventory(provider_number_id)
		`)
		.run();

	await env.nomorescamcalls_db
		.prepare(`
			CREATE TABLE IF NOT EXISTS evidence_library_calls (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				call_session_id TEXT NOT NULL UNIQUE,
				call_control_id TEXT NOT NULL,
				call_started_at TEXT NOT NULL,
				call_completed_at TEXT,
				created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
				updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
				final_standing INTEGER,
				final_disposition TEXT,
				evidence_box TEXT NOT NULL,
				caller_calling_number TEXT,
				caller_cnam TEXT,
				caller_carrier TEXT,
				caller_line_type TEXT,
				caller_stir_shaken TEXT,
				caller_ipqs TEXT,
				caller_name TEXT,
				caller_name_accepted INTEGER,
				caller_block_2_findings TEXT,
				caller_block_2_deductions TEXT,
				caller_prompt_1_recording TEXT,
				caller_prompt_1_transcript TEXT,
				caller_prompt_1_evaluation TEXT,
				caller_prompt_2_recording TEXT,
				caller_prompt_2_transcript TEXT,
				caller_prompt_2_evaluation TEXT,
				caller_reason_for_calling TEXT,
				caller_reason_accepted INTEGER,
				caller_response_deductions TEXT,
				caller_recovered_deductions TEXT,
				caller_ipqs_deductions TEXT,
				complete_call_recording TEXT,
				call_duration_seconds INTEGER,
				billable_minutes REAL,
				call_cost REAL,
				caller_country TEXT,
				caller_state TEXT,
				caller_county TEXT,
				caller_city TEXT,
				caller_zip_code TEXT,
				caller_area_code TEXT,
				caller_geographic_information TEXT,
				call_date TEXT,
				call_start_time TEXT,
				call_day_of_week TEXT,
				call_week_of_month INTEGER,
				call_month INTEGER,
				call_year INTEGER,
				prompt_1_at TEXT,
				prompt_2_at TEXT,
				connection_at TEXT,
				diversion_at TEXT,
				recording_available_at TEXT,
				caller_stated_reason TEXT,
				caller_accepted_reason TEXT,
				caller_unaccepted_reason TEXT,
				caller_supporting_evidence TEXT,
				caller_deductions TEXT,
				subscriber_id INTEGER,
				protected_line_id INTEGER,
				subscriber_name TEXT,
				subscriber_caller_facing_business_name TEXT,
				subscriber_phone_number TEXT,
				subscriber_screening_number TEXT,
				subscriber_sip_username TEXT,
				subscriber_carrier TEXT,
				subscriber_account_status TEXT,
				subscriber_coverage_status TEXT,
				subscriber_connected INTEGER,
				subscriber_diverted INTEGER,
				subscriber_country TEXT,
				subscriber_state TEXT,
				subscriber_county TEXT,
				subscriber_city TEXT,
				subscriber_zip_code TEXT,
				subscriber_community TEXT,
				subscriber_supporting_evidence TEXT,
				telnyx_final_record TEXT
			)
		`)
		.run();

	const evidenceColumns = await env.nomorescamcalls_db
		.prepare("PRAGMA table_info(evidence_library_calls)")
		.all<{ name: string }>();
	if (!evidenceColumns.results.some((column) =>
		column.name === "subscriber_caller_facing_business_name"
	)) {
		await env.nomorescamcalls_db
			.prepare("ALTER TABLE evidence_library_calls ADD COLUMN subscriber_caller_facing_business_name TEXT")
			.run();
	}
	if (!evidenceColumns.results.some((column) =>
		column.name === "protected_line_id"
	)) {
		await env.nomorescamcalls_db
			.prepare("ALTER TABLE evidence_library_calls ADD COLUMN protected_line_id INTEGER")
			.run();
	}

	await env.nomorescamcalls_db
		.prepare(`
			CREATE TABLE IF NOT EXISTS knowledge_engine_search_history (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				search_criteria TEXT NOT NULL,
				sort_field TEXT NOT NULL DEFAULT 'call_started_at',
				sort_direction TEXT NOT NULL DEFAULT 'DESC',
				result_count INTEGER NOT NULL DEFAULT 0,
				executed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
		`)
		.run();

	await env.nomorescamcalls_db
		.prepare(`
			CREATE TABLE IF NOT EXISTS knowledge_engine_recipe_catalog (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				search_history_id INTEGER NOT NULL UNIQUE,
				title TEXT NOT NULL,
				purpose TEXT NOT NULL,
				created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY (search_history_id)
					REFERENCES knowledge_engine_search_history(id)
					ON DELETE RESTRICT
			)
		`)
		.run();

	await env.nomorescamcalls_db
		.prepare(`
			CREATE TABLE IF NOT EXISTS beta_agreement_acceptances (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id INTEGER NOT NULL,
				agreement_version TEXT NOT NULL,
				accepted_at TEXT DEFAULT CURRENT_TIMESTAMP,
				UNIQUE(user_id, agreement_version),
				FOREIGN KEY (user_id)
					REFERENCES users(id)
					ON DELETE RESTRICT
			)
		`)
		.run();

	await env.nomorescamcalls_db
		.prepare(`
			CREATE INDEX IF NOT EXISTS idx_beta_agreement_acceptances_user_id
			ON beta_agreement_acceptances(user_id)
		`)
		.run();
}
