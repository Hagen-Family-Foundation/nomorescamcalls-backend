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
			transcription: null
		});

		expect(
			shouldScreenTelnyxEvent(event)
		).toBe(true);
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
					from: "+19139562493",
					to:
						"sip:usersupport15892@sip.telnyx.com"
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
					from: "+19139562493",
					to: "usersupport15892"
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
