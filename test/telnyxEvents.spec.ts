import {
	describe,
	expect,
	it
} from "vitest";
import {
	normalizeTelnyxEvent,
	shouldScreenTelnyxEvent
} from "../src/services/telnyxEvents";

describe("Telnyx event normalization", () => {
	it("screens the original inbound Telnyx number call", () => {
		const event = normalizeTelnyxEvent({
			data: {
				event_type: "call.initiated",
				payload: {
					call_control_id:
						"test-call-control-id",
					call_session_id:
						"test-call-session-id",
					from: "+15550001001",
					to: "+15550002001",
					direction: "incoming",
					flow_destination:
						"telnyx_number_cc_app"
				}
			}
		});

		expect(event).toEqual({
			eventType: "call.initiated",
			callControlId:
				"test-call-control-id",
			callSessionId:
				"test-call-session-id",
			from: "+15550001001",
			to: "+15550002001",
			direction: "incoming",
			flowDestination:
				"telnyx_number_cc_app",
			clientState: null,
			transcription: null
		});

		expect(
			shouldScreenTelnyxEvent(event)
		).toBe(true);
		expect(event).not.toHaveProperty(
			"callScreeningResult"
		);
		expect(event).not.toHaveProperty(
			"shakenStirAttestation"
		);
		expect(event).not.toHaveProperty(
			"shakenStirValidated"
		);
	});

	it("preserves documented call screening and STIR/SHAKEN fields without interpreting them", () => {
		const event = normalizeTelnyxEvent({
			data: {
				event_type: "call.initiated",
				payload: {
					call_control_id: "screened-control-id",
					call_session_id: "screened-session-id",
					from: "+18005550101",
					to: "+18005550201",
					direction: "incoming",
					call_screening_result: "spam_likely",
					shaken_stir_attestation: "C",
					shaken_stir_validated: false
				}
			}
		});

		expect(event.callScreeningResult).toBe(
			"spam_likely"
		);
		expect(event.shakenStirAttestation).toBe("C");
		expect(event.shakenStirValidated).toBe(false);
		expect(shouldScreenTelnyxEvent(event)).toBe(true);
	});

	it("preserves a richer structured call screening result exactly when supplied", () => {
		const callScreeningResult = {
			action: "flag",
			result: "spam_likely",
			reputation: {
				classification: "spam_likely",
				provider: "telnyx"
			}
		};
		const event = normalizeTelnyxEvent({
			data: {
				event_type: "call.initiated",
				payload: {
					call_control_id: "structured-control-id",
					call_session_id: "structured-session-id",
					from: "+18005550102",
					to: "+18005550202",
					direction: "incoming",
					call_screening_result: callScreeningResult
				}
			}
		});

		expect(event.callScreeningResult).toBe(
			callScreeningResult
		);
		expect(event.callScreeningResult).toEqual({
			action: "flag",
			result: "spam_likely",
			reputation: {
				classification: "spam_likely",
				provider: "telnyx"
			}
		});
	});

	it("does not screen an outbound transfer leg", () => {
		const event = normalizeTelnyxEvent({
			data: {
				event_type: "call.initiated",
				payload: {
					call_control_id:
						"transfer-control-id",
					call_session_id:
						"test-call-session-id",
					direction: "outgoing",
					flow_destination:
						"telnyx_sip_uri_cred_connection",
					from: "+18005550993",
					to:
						"sip:test_user_support_15892@sip.telnyx.com"
				}
			}
		});

		expect(
			shouldScreenTelnyxEvent(event)
		).toBe(false);
	});

	it("does not screen a SIP credential delivery leg", () => {
		const event = normalizeTelnyxEvent({
			data: {
				event_type: "call.initiated",
				payload: {
					call_control_id:
						"sip-control-id",
					call_session_id:
						"test-call-session-id",
					direction: "incoming",
					flow_destination:
						"telnyx_sip_uri_cred_connection",
					from: "+18005550993",
					to: "test_user_support_15892"
				}
			}
		});

		expect(
			shouldScreenTelnyxEvent(event)
		).toBe(false);
	});

	it("normalizes a native transcription event", () => {
		const event = normalizeTelnyxEvent({
			data: {
				event_type:
					"call.transcription",
				payload: {
					call_control_id:
						"transcription-control-id",
					call_session_id:
						"transcription-session-id",
					transcription_data: {
						confidence: 0.977219,
						is_final: true,
						transcript:
							"Kelly calling about the inspection."
					}
				}
			}
		});

		expect(event).toEqual({
			eventType: "call.transcription",
			callControlId:
				"transcription-control-id",
			callSessionId:
				"transcription-session-id",
			from: "",
			to: "",
			direction: "",
			flowDestination: "",
			clientState: null,
			transcription: {
				confidence: 0.977219,
				isFinal: true,
				transcript:
					"Kelly calling about the inspection."
			}
		});

		expect(
			shouldScreenTelnyxEvent(event)
		).toBe(false);
	});

	it("normalizes Telnyx client_state used to correlate speech playback", () => {
		const event = normalizeTelnyxEvent({
			data: {
				event_type: "call.speak.ended",
				payload: {
					call_control_id: "control-id",
					call_session_id: "session-id",
					client_state: "playback-marker"
				}
			}
		});

		expect(event.clientState).toBe("playback-marker");
	});

	it("does not process unrelated Telnyx events as inbound calls", () => {
		const event = normalizeTelnyxEvent({
			data: {
				event_type: "call.answered",
				payload: {
					call_control_id:
						"test-call-control-id",
					call_session_id:
						"test-call-session-id"
				}
			}
		});

		expect(
			shouldScreenTelnyxEvent(event)
		).toBe(false);
	});
});
