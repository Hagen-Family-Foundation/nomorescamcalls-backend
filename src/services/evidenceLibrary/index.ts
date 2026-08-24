import type {
	Block3EvidenceBox
} from "../evidenceEngine/block3";

export interface EvidenceLibrarySubscriber {
	id: number | null;
	name: string | null;
	callerFacingBusinessName: string | null;
	phoneNumber: string | null;
	screeningNumber: string | null;
	sipUsername: string | null;
	carrier: string | null;
	accountStatus: string | null;
	coverageStatus: string | null;
	country: string | null;
	state: string | null;
	county: string | null;
	city: string | null;
	zipCode: string | null;
	community: string | null;
}

export interface EvidenceLibraryCallInformation {
	callSessionId: string;
	callControlId: string;
	callStartedAt: string;
	callCompletedAt: string | null;
	callingNumber: string | null;
	cnam: string | null;
	carrier: string | null;
	lineType: string | null;
	stirShaken: unknown;
	country: string | null;
	state: string | null;
	county: string | null;
	city: string | null;
	zipCode: string | null;
	areaCode: string | null;
	geographicInformation: unknown;
	prompt1At: string | null;
	prompt2At: string | null;
	connectionAt: string | null;
	diversionAt: string | null;
}

export interface EvidenceLibraryInput {
	evidenceBox: Block3EvidenceBox;
	callInformation: EvidenceLibraryCallInformation;
	subscriber: EvidenceLibrarySubscriber;
}

export interface EvidenceLibraryReceipt {
	callSessionId: string;
	callControlId: string;
	finalStanding: number;
	finalDisposition: string;
	callStartedAt: string;
	storedAt: string;
}

export interface TelnyxFinalCallInformation {
	callSessionId: string;
	callCompletedAt?: string | null;
	recording?: unknown;
	recordingAvailableAt?: string | null;
	callDurationSeconds?: number | null;
	billableMinutes?: number | null;
	callCost?: number | null;
	finalRecord: unknown;
}

function dateParts(callStartedAt: string): {
	callDate: string;
	callStartTime: string;
	dayOfWeek: string;
	weekOfMonth: number;
	month: number;
	year: number;
} {
	const date = new Date(callStartedAt);

	if (Number.isNaN(date.getTime())) {
		throw new Error(
			"Evidence Library call start time is invalid."
		);
	}

	const day = date.getUTCDate();

	return {
		callDate:
			date.toISOString().slice(0, 10),
		callStartTime:
			date.toISOString().slice(11, 19),
		dayOfWeek:
			[
				"Sunday",
				"Monday",
				"Tuesday",
				"Wednesday",
				"Thursday",
				"Friday",
				"Saturday"
			][date.getUTCDay()],
		weekOfMonth:
			Math.ceil(day / 7),
		month:
			date.getUTCMonth() + 1,
		year:
			date.getUTCFullYear()
	};
}

function jsonValue(value: unknown): string | null {
	if (
		value === null ||
		value === undefined
	) {
		return null;
	}

	return JSON.stringify(value);
}

function booleanValue(
	value: boolean | null | undefined
): number | null {
	if (value === null || value === undefined) {
		return null;
	}

	return value ? 1 : 0;
}

function acceptedCallerName(
	evidenceBox: Block3EvidenceBox
): {
	name: string | null;
	accepted: boolean | null;
} {
	const prompt2 =
		evidenceBox.prompt2;

	if (
		prompt2?.evaluation.nameAccepted
	) {
		return {
			name: prompt2.transcript,
			accepted: true
		};
	}

	if (
		evidenceBox.prompt1
			.evaluation.nameAccepted
	) {
		return {
			name:
				evidenceBox.prompt1.transcript,
			accepted: true
		};
	}

	return {
		name: null,
		accepted: false
	};
}

function acceptedCallerReason(
	evidenceBox: Block3EvidenceBox
): {
	reason: string | null;
	accepted: boolean | null;
	unaccepted: string | null;
} {
	const prompt2 =
		evidenceBox.prompt2;

	if (
		prompt2?.evaluation.reasonAccepted
	) {
		return {
			reason: prompt2.transcript,
			accepted: true,
			unaccepted: null
		};
	}

	if (
		evidenceBox.prompt1
			.evaluation.reasonAccepted
	) {
		return {
			reason:
				evidenceBox.prompt1.transcript,
			accepted: true,
			unaccepted: null
		};
	}

	const unaccepted = [
		evidenceBox.prompt1.transcript,
		prompt2?.transcript ?? ""
	]
		.filter((value) => value.trim())
		.join("\n");

	return {
		reason: null,
		accepted: false,
		unaccepted:
			unaccepted || null
	};
}

export async function receiveEvidenceBox(
	db: D1Database,
	input: EvidenceLibraryInput,
	now: () => string = () =>
		new Date().toISOString()
): Promise<EvidenceLibraryReceipt> {
	const {
		evidenceBox,
		callInformation,
		subscriber
	} = input;

	if (!callInformation.callSessionId) {
		throw new Error(
			"Evidence Library requires the Telnyx Call Session ID."
		);
	}

	if (!callInformation.callControlId) {
		throw new Error(
			"Evidence Library requires the Telnyx Call Control ID."
		);
	}

	const storedAt = now();

	const chronology =
		dateParts(
			callInformation.callStartedAt
		);

	const callerName =
		acceptedCallerName(evidenceBox);

	const callerReason =
		acceptedCallerReason(evidenceBox);

	const connected =
		evidenceBox.callResult ===
		"connected";

	const diverted =
		evidenceBox.callResult ===
		"diverted";

	const prompt1 =
		evidenceBox.prompt1;

	const prompt2 =
		evidenceBox.prompt2;

	await db
		.prepare(`
			INSERT INTO evidence_library_calls (
				call_session_id,
				call_control_id,
				call_started_at,
				call_completed_at,
				created_at,
				updated_at,
				final_standing,
				final_disposition,
				evidence_box,

				caller_calling_number,
				caller_cnam,
				caller_carrier,
				caller_line_type,
				caller_stir_shaken,
				caller_ipqs,
				caller_name,
				caller_name_accepted,

				caller_block_2_findings,
				caller_block_2_deductions,
				caller_prompt_1_recording,
				caller_prompt_1_transcript,
				caller_prompt_1_evaluation,
				caller_prompt_2_recording,
				caller_prompt_2_transcript,
				caller_prompt_2_evaluation,
				caller_reason_for_calling,
				caller_reason_accepted,
				caller_response_deductions,
				caller_recovered_deductions,
				caller_ipqs_deductions,

				caller_country,
				caller_state,
				caller_county,
				caller_city,
				caller_zip_code,
				caller_area_code,
				caller_geographic_information,

				call_date,
				call_start_time,
				call_day_of_week,
				call_week_of_month,
				call_month,
				call_year,
				prompt_1_at,
				prompt_2_at,
				connection_at,
				diversion_at,

				caller_stated_reason,
				caller_accepted_reason,
				caller_unaccepted_reason,
				caller_supporting_evidence,
				caller_deductions,

				subscriber_id,
				subscriber_name,
				subscriber_caller_facing_business_name,
				subscriber_phone_number,
				subscriber_screening_number,
				subscriber_sip_username,
				subscriber_carrier,
				subscriber_account_status,
				subscriber_coverage_status,

				subscriber_connected,
				subscriber_diverted,

				subscriber_country,
				subscriber_state,
				subscriber_county,
				subscriber_city,
				subscriber_zip_code,
				subscriber_community,

				subscriber_supporting_evidence
			)
			VALUES (
				?, ?, ?, ?, ?, ?, ?, ?, ?,
				?, ?, ?, ?, ?, ?, ?, ?,
				?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
				?, ?, ?, ?, ?, ?, ?,
				?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
				?, ?, ?, ?, ?,
				?, ?, ?, ?, ?, ?, ?, ?, ?,
				?, ?,
				?, ?, ?, ?, ?, ?,
				?
			)
			ON CONFLICT(call_session_id) DO UPDATE SET
				call_control_id =
					excluded.call_control_id,
				call_started_at =
					excluded.call_started_at,
				call_completed_at =
					excluded.call_completed_at,
				updated_at =
					excluded.updated_at,
				final_standing =
					excluded.final_standing,
				final_disposition =
					excluded.final_disposition,
				evidence_box =
					excluded.evidence_box,

				caller_calling_number =
					excluded.caller_calling_number,
				caller_cnam =
					excluded.caller_cnam,
				caller_carrier =
					excluded.caller_carrier,
				caller_line_type =
					excluded.caller_line_type,
				caller_stir_shaken =
					excluded.caller_stir_shaken,
				caller_ipqs =
					excluded.caller_ipqs,
				caller_name =
					excluded.caller_name,
				caller_name_accepted =
					excluded.caller_name_accepted,

				caller_block_2_findings =
					excluded.caller_block_2_findings,
				caller_block_2_deductions =
					excluded.caller_block_2_deductions,
				caller_prompt_1_recording =
					excluded.caller_prompt_1_recording,
				caller_prompt_1_transcript =
					excluded.caller_prompt_1_transcript,
				caller_prompt_1_evaluation =
					excluded.caller_prompt_1_evaluation,
				caller_prompt_2_recording =
					excluded.caller_prompt_2_recording,
				caller_prompt_2_transcript =
					excluded.caller_prompt_2_transcript,
				caller_prompt_2_evaluation =
					excluded.caller_prompt_2_evaluation,
				caller_reason_for_calling =
					excluded.caller_reason_for_calling,
				caller_reason_accepted =
					excluded.caller_reason_accepted,
				caller_response_deductions =
					excluded.caller_response_deductions,
				caller_recovered_deductions =
					excluded.caller_recovered_deductions,
				caller_ipqs_deductions =
					excluded.caller_ipqs_deductions,

				caller_country =
					excluded.caller_country,
				caller_state =
					excluded.caller_state,
				caller_county =
					excluded.caller_county,
				caller_city =
					excluded.caller_city,
				caller_zip_code =
					excluded.caller_zip_code,
				caller_area_code =
					excluded.caller_area_code,
				caller_geographic_information =
					excluded.caller_geographic_information,

				call_date =
					excluded.call_date,
				call_start_time =
					excluded.call_start_time,
				call_day_of_week =
					excluded.call_day_of_week,
				call_week_of_month =
					excluded.call_week_of_month,
				call_month =
					excluded.call_month,
				call_year =
					excluded.call_year,
				prompt_1_at =
					excluded.prompt_1_at,
				prompt_2_at =
					excluded.prompt_2_at,
				connection_at =
					excluded.connection_at,
				diversion_at =
					excluded.diversion_at,

				caller_stated_reason =
					excluded.caller_stated_reason,
				caller_accepted_reason =
					excluded.caller_accepted_reason,
				caller_unaccepted_reason =
					excluded.caller_unaccepted_reason,
				caller_supporting_evidence =
					excluded.caller_supporting_evidence,
				caller_deductions =
					excluded.caller_deductions,

				subscriber_id =
					excluded.subscriber_id,
				subscriber_name =
					excluded.subscriber_name,
				subscriber_caller_facing_business_name =
					excluded.subscriber_caller_facing_business_name,
				subscriber_phone_number =
					excluded.subscriber_phone_number,
				subscriber_screening_number =
					excluded.subscriber_screening_number,
				subscriber_sip_username =
					excluded.subscriber_sip_username,
				subscriber_carrier =
					excluded.subscriber_carrier,
				subscriber_account_status =
					excluded.subscriber_account_status,
				subscriber_coverage_status =
					excluded.subscriber_coverage_status,

				subscriber_connected =
					excluded.subscriber_connected,
				subscriber_diverted =
					excluded.subscriber_diverted,

				subscriber_country =
					excluded.subscriber_country,
				subscriber_state =
					excluded.subscriber_state,
				subscriber_county =
					excluded.subscriber_county,
				subscriber_city =
					excluded.subscriber_city,
				subscriber_zip_code =
					excluded.subscriber_zip_code,
				subscriber_community =
					excluded.subscriber_community,

				subscriber_supporting_evidence =
					excluded.subscriber_supporting_evidence
		`)
		.bind(
			callInformation.callSessionId,
			callInformation.callControlId,
			callInformation.callStartedAt,
			callInformation.callCompletedAt,
			storedAt,
			storedAt,
			evidenceBox.finalStanding,
			evidenceBox.callResult,
			JSON.stringify(evidenceBox),

			callInformation.callingNumber,
			callInformation.cnam,
			callInformation.carrier,
			callInformation.lineType,
			jsonValue(
				callInformation.stirShaken
			),
			jsonValue(
				evidenceBox.ipqsResult
			),
			callerName.name,
			booleanValue(
				callerName.accepted
			),

			jsonValue(
				evidenceBox.block2EvidenceBox
			),
			jsonValue(
				evidenceBox.block2Deductions
			),
			prompt1.audioRecordingReference,
			prompt1.transcript,
			jsonValue(prompt1.evaluation),
			prompt2
				?.audioRecordingReference ??
				null,
			prompt2?.transcript ?? null,
			jsonValue(
				prompt2?.evaluation
			),
			callerReason.reason,
			booleanValue(
				callerReason.accepted
			),
			jsonValue(
				evidenceBox.block3Deductions
			),
			jsonValue(
				evidenceBox
					.recoveredCallerResponseDeductions
			),
			jsonValue(
				evidenceBox.ipqsDeductions
			),

			callInformation.country,
			callInformation.state,
			callInformation.county,
			callInformation.city,
			callInformation.zipCode,
			callInformation.areaCode,
			jsonValue(
				callInformation
					.geographicInformation
			),

			chronology.callDate,
			chronology.callStartTime,
			chronology.dayOfWeek,
			chronology.weekOfMonth,
			chronology.month,
			chronology.year,
			callInformation.prompt1At,
			callInformation.prompt2At,
			callInformation.connectionAt,
			callInformation.diversionAt,

			callerReason.reason,
			callerReason.reason,
			callerReason.unaccepted,
			jsonValue(
				evidenceBox.allDeductions
			),
			jsonValue(
				evidenceBox.allDeductions
			),

			subscriber.id,
			subscriber.name,
			subscriber.callerFacingBusinessName,
			subscriber.phoneNumber,
			subscriber.screeningNumber,
			subscriber.sipUsername,
			subscriber.carrier,
			subscriber.accountStatus,
			subscriber.coverageStatus,

			booleanValue(connected),
			booleanValue(diverted),

			subscriber.country,
			subscriber.state,
			subscriber.county,
			subscriber.city,
			subscriber.zipCode,
			subscriber.community,

			jsonValue(
				evidenceBox.allDeductions
			)
		)
		.run();

	return {
		callSessionId:
			callInformation.callSessionId,
		callControlId:
			callInformation.callControlId,
		finalStanding:
			evidenceBox.finalStanding,
		finalDisposition:
			evidenceBox.callResult,
		callStartedAt:
			callInformation.callStartedAt,
		storedAt
	};
}

export async function attachTelnyxFinalCallInformation(
	db: D1Database,
	input: TelnyxFinalCallInformation,
	now: () => string = () =>
		new Date().toISOString()
): Promise<boolean> {
	const result = await db
		.prepare(`
			UPDATE evidence_library_calls
			SET
				call_completed_at =
					COALESCE(?, call_completed_at),
				complete_call_recording =
					COALESCE(?, complete_call_recording),
				recording_available_at =
					COALESCE(?, recording_available_at),
				call_duration_seconds =
					COALESCE(?, call_duration_seconds),
				billable_minutes =
					COALESCE(?, billable_minutes),
				call_cost =
					COALESCE(?, call_cost),
				telnyx_final_record = ?,
				updated_at = ?
			WHERE call_session_id = ?
		`)
		.bind(
			input.callCompletedAt ?? null,
			jsonValue(input.recording),
			input.recordingAvailableAt ?? null,
			input.callDurationSeconds ?? null,
			input.billableMinutes ?? null,
			input.callCost ?? null,
			JSON.stringify(input.finalRecord),
			now(),
			input.callSessionId
		)
		.run();

	return result.meta.changes > 0;
}
