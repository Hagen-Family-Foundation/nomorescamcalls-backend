import {
	beforeAll,
	describe,
	expect,
	it,
	vi
} from "vitest";
import {
	env
} from "cloudflare:test";
import {
	completeBlock1,
	completeBlock2,
	completeEvidenceEngineCall
} from "../src/services/evidenceEngine";
import type {
	Block3CallController,
	CallerResponseEvaluator
} from "../src/services/evidenceEngine";
import {
	ensureTestSchema
} from "./testSchema";

describe("Evidence Engine Call Flow", () => {
	beforeAll(async () => {
		await ensureTestSchema();
	});

	it("hands the completed Block 3 Evidence Box to Block 4 and stores it in the Evidence Library", async () => {
		const block1EvidenceBox =
			completeBlock1({
				callInformation: {
					callSessionId:
						"flow-session-1"
				},
				callRecord: {},
				billingTimer: {}
			});

		const block2EvidenceBox =
			completeBlock2({
				block1EvidenceBox,
				screeningInformation: {
					callingNumberInformation: {
						number:
							"+19135550100"
					},
					stirShakenInformation: {
						attestation: "A"
					},
					cnamInformation: {
						name:
							"Test Caller"
					},
					carrierLineLookupInformation: {
						carrier:
							"Test Carrier",
						lineType:
							"Wireless"
					}
				},
				deductions: []
			});

		const evaluator:
			CallerResponseEvaluator = {
				evaluate: vi.fn()
					.mockResolvedValue({
						nameAccepted: true,
						reasonAccepted: true
					})
			};

		const callController:
			Block3CallController = {
				startRecording:
					vi.fn(),
				connectSubscriber:
					vi.fn(),
				playUnavailableAndDisconnect:
					vi.fn(),
				stopRecording:
					vi.fn()
			};

		const result =
			await completeEvidenceEngineCall({
				db:
					env.nomorescamcalls_db,
				block3Input: {
					block2EvidenceBox,
					prompt1: {
						audioRecordingReference:
							"flow-recording-1",
						transcript:
							"Kelly calling about an appointment.",
						language: "en"
					},
					evaluator,
					callController
				},
				callInformation: {
					callSessionId:
						"flow-session-1",
					callControlId:
						"flow-control-1",
					callStartedAt:
						"2026-08-07T11:00:00.000Z",
					callCompletedAt:
						"2026-08-07T11:00:05.000Z",
					callingNumber:
						"+19135550100",
					cnam:
						"Test Caller",
					carrier:
						"Test Carrier",
					lineType:
						"Wireless",
					stirShaken: {
						attestation: "A"
					},
					country: "US",
					state: "Kansas",
					county: null,
					city: null,
					zipCode: null,
					areaCode: "913",
					geographicInformation:
						null,
					prompt1At:
						"2026-08-07T11:00:02.000Z",
					prompt2At: null,
					connectionAt:
						"2026-08-07T11:00:05.000Z",
					diversionAt: null
				},
				subscriber: {
					id: 1,
					name:
						"Test Subscriber",
					phoneNumber:
						"+19135550200",
					screeningNumber:
						"+19139562493",
					sipUsername:
						"test_subscriber",
					carrier: null,
					accountStatus:
						"active",
					coverageStatus:
						"active",
					country: "US",
					state: "Missouri",
					county: null,
					city:
						"Kansas City",
					zipCode: null,
					community: null
				},
				now: () =>
					"2026-08-07T11:00:06.000Z"
			});

		expect(
			result.block3EvidenceBox
				.callResult
		).toBe("connected");

		expect(
			result.block4DeliveryRecord
		).toEqual({
			deliveryAttempted: true,
			deliveryTimestamp:
				"2026-08-07T11:00:06.000Z",
			deliveryCompleted: true,
			deliveryError: null
		});

		expect(
			result.evidenceLibraryReceipt
		).toEqual({
			callSessionId:
				"flow-session-1",
			callControlId:
				"flow-control-1",
			finalStanding: 100,
			finalDisposition:
				"connected",
			callStartedAt:
				"2026-08-07T11:00:00.000Z",
			storedAt:
				"2026-08-07T11:00:06.000Z"
		});

		const stored =
			await env.nomorescamcalls_db
				.prepare(`
					SELECT
						call_session_id,
						call_control_id,
						final_standing,
						final_disposition
					FROM evidence_library_calls
					WHERE call_session_id = ?
				`)
				.bind(
					"flow-session-1"
				)
				.first<{
					call_session_id:
						string;
					call_control_id:
						string;
					final_standing:
						number;
					final_disposition:
						string;
				}>();

		expect(stored).toEqual({
			call_session_id:
				"flow-session-1",
			call_control_id:
				"flow-control-1",
			final_standing: 100,
			final_disposition:
				"connected"
		});

		expect(
			callController
				.connectSubscriber
		).toHaveBeenCalledOnce();
	});
});
