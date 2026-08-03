CREATE TABLE evidence_library_calls (
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
	subscriber_name TEXT,
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
);

CREATE INDEX idx_evidence_library_call_started_at
ON evidence_library_calls(call_started_at);

CREATE INDEX idx_evidence_library_final_disposition
ON evidence_library_calls(final_disposition);

CREATE INDEX idx_evidence_library_calling_number
ON evidence_library_calls(caller_calling_number);

CREATE INDEX idx_evidence_library_caller_state
ON evidence_library_calls(caller_state);

CREATE INDEX idx_evidence_library_subscriber_id
ON evidence_library_calls(subscriber_id);

CREATE INDEX idx_evidence_library_subscriber_state
ON evidence_library_calls(subscriber_state);

CREATE INDEX idx_evidence_library_day_time
ON evidence_library_calls(
	call_day_of_week,
	call_start_time
);

CREATE INDEX idx_evidence_library_cost
ON evidence_library_calls(call_cost);
