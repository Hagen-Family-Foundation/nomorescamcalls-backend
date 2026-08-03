import {
	beforeAll,
	describe,
	expect,
	it
} from "vitest";
import {
	env
} from "cloudflare:test";
import {
	completeBlock1,
	completeBlock2
} from "../src/services/evidenceEngine";
import type {
	Block3EvidenceBox
} from "../src/services/evidenceEngine";
import {
	attachTelnyxFinalCallInformation,
	receiveEvidenceBox
} from "../src/services/evidenceLibrary";
import {
	ensureTestSchema
} from "./testSchema";

async function ensureEvidenceLibrarySchema():
	Promise<void> {
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
			)
		`)
		.run();
}

function createEvidenceBox():
	Block3EvidenceBox {
	const block1EvidenceBox =
		completeBlock1({
			callInformation: {},
			callRecord: {},
			billingTimer: {}
		});

	const block2EvidenceBox =
		completeBlock2({
			block1EvidenceBox,
			screeningInformation: {
				callingNumberInformation: {
					number: "+15550001111"
				},
				stirShakenInformation: {
					attestation: "A"
				},
				cnamInformation: {
					name: "Maria Lopez"
				},
				carrierLineLookupInformation: {
					carrier: "Example Carrier",
					lineType: "Wireless"
				}
			},
			deductions: []
		});

	return {
		block2EvidenceBox,
		prompt1: {
			audioRecordingReference:
				"recording-1",
			transcript:
				"Maria Lopez calling about an appointment.",
			language: "en",
			evaluation: {
				nameAccepted: true,
				reasonAccepted: true
			}
		},
		prompt2: null,
		block2Deductions: [],
		initialCallerResponseDeductions: [],
		recoveredCallerResponseDeductions: [],
		block3Deductions: [],
		ipqsPerformed: false,
		ipqsResult: null,
		ipqsDeductions: [],
		allDeductions: [],
		standingAfterFirstResponse: 100,
		finalStanding: 100,
		callResult: "connected",
		recordingCompleted: true
	};
}

function createLibraryInput(
	callSessionId: string
) {
	return {
		evidenceBox:
			createEvidenceBox(),
		callInformation: {
			callSessionId,
			callControlId:
				`${callSessionId}-control`,
			callStartedAt:
				"2026-08-03T14:30:00.000Z",
			callCompletedAt: null,
			callingNumber:
				"+15550001111",
			cnam:
				"Maria Lopez",
			carrier:
				"Example Carrier",
			lineType:
				"Wireless",
			stirShaken: {
				attestation: "A"
			},
			country:
				"US",
			state:
				"Missouri",
			county:
				"Jackson",
			city:
				"Kansas City",
			zipCode:
				"64106",
			areaCode:
				"816",
			geographicInformation: {
				region:
					"Kansas City Metro"
			},
			prompt1At:
				"2026-08-03T14:30:02.000Z",
			prompt2At: null,
			connectionAt:
				"2026-08-03T14:30:05.000Z",
			diversionAt: null
		},
		subscriber: {
			id: 12,
			name:
				"Test Subscriber",
			phoneNumber:
				"+15550002222",
			screeningNumber:
				"+15550003333",
			sipUsername:
				"subscriber_12",
			carrier:
				"Subscriber Carrier",
			accountStatus:
				"active",
			coverageStatus:
				"active",
			country:
				"US",
			state:
				"Missouri",
			county:
				"Jackson",
			city:
				"Kansas City",
			zipCode:
				"64111",
			community:
				"Test Community"
		}
	};
}

describe("Evidence Library", () => {
	beforeAll(async () => {
		await ensureTestSchema();
		await ensureEvidenceLibrarySchema();
	});

	it("stores one chronological searchable Call Record", async () => {
		const receipt =
			await receiveEvidenceBox(
				env.nomorescamcalls_db,
				createLibraryInput(
					"library-session-1"
				),
				() =>
					"2026-08-03T14:30:06.000Z"
			);

		expect(receipt).toEqual({
			callSessionId:
				"library-session-1",
			callControlId:
				"library-session-1-control",
			finalStanding: 100,
			finalDisposition:
				"connected",
			callStartedAt:
				"2026-08-03T14:30:00.000Z",
			storedAt:
				"2026-08-03T14:30:06.000Z"
		});

		const stored =
			await env.nomorescamcalls_db
				.prepare(`
					SELECT
						call_session_id,
						call_day_of_week,
						call_start_time,
						caller_state,
						subscriber_state,
						subscriber_connected,
						final_disposition
					FROM evidence_library_calls
					WHERE call_session_id = ?
				`)
				.bind("library-session-1")
				.first<{
					call_session_id: string;
					call_day_of_week: string;
					call_start_time: string;
					caller_state: string;
					subscriber_state: string;
					subscriber_connected:
						number;
					final_disposition: string;
				}>();

		expect(stored).toEqual({
			call_session_id:
				"library-session-1",
			call_day_of_week:
				"Monday",
			call_start_time:
				"14:30:00",
			caller_state:
				"Missouri",
			subscriber_state:
				"Missouri",
			subscriber_connected: 1,
			final_disposition:
				"connected"
		});
	});

	it("adds final Telnyx information to the same Call Record", async () => {
		await receiveEvidenceBox(
			env.nomorescamcalls_db,
			createLibraryInput(
				"library-session-final"
			),
			() =>
				"2026-08-03T14:30:06.000Z"
		);

		const attached =
			await attachTelnyxFinalCallInformation(
				env.nomorescamcalls_db,
				{
					callSessionId:
						"library-session-final",
					callCompletedAt:
						"2026-08-03T14:42:00.000Z",
					recording: {
						id:
							"recording-final-1"
					},
					recordingAvailableAt:
						"2026-08-03T14:43:00.000Z",
					callDurationSeconds: 720,
					billableMinutes: 12,
					callCost: 0.18,
					finalRecord: {
						source: "Telnyx"
					}
				},
				() =>
					"2026-08-03T14:43:00.000Z"
			);

		expect(attached).toBe(true);

		const stored =
			await env.nomorescamcalls_db
				.prepare(`
					SELECT
						call_completed_at,
						call_duration_seconds,
						billable_minutes,
						call_cost,
						complete_call_recording,
						recording_available_at
					FROM evidence_library_calls
					WHERE call_session_id = ?
				`)
				.bind(
					"library-session-final"
				)
				.first<{
					call_completed_at: string;
					call_duration_seconds: number;
					billable_minutes: number;
					call_cost: number;
					complete_call_recording:
						string;
					recording_available_at:
						string;
				}>();

		expect(stored).toEqual({
			call_completed_at:
				"2026-08-03T14:42:00.000Z",
			call_duration_seconds: 720,
			billable_minutes: 12,
			call_cost: 0.18,
			complete_call_recording:
				JSON.stringify({
					id: "recording-final-1"
				}),
			recording_available_at:
				"2026-08-03T14:43:00.000Z"
		});
	});
});
