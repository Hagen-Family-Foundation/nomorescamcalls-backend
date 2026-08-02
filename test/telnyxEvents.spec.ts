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
	it("normalizes an inbound call event", () => {
		const event = normalizeTelnyxEvent({
			data: {
				event_type: "call.initiated",
				payload: {
					call_control_id:
						"test-call-control-id",
					call_session_id:
						"test-call-session-id",
					from: "+15550001001",
					to: "+15550002001"
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
			to: "+15550002001"
		});

		expect(
			shouldScreenTelnyxEvent(event)
		).toBe(true);
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
