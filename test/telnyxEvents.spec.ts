import { describe, it, expect } from "vitest";
import {
	normalizeTelnyxEvent,
	shouldHandleTelnyxChallengeResponse
} from "../src/services/telnyxEvents";

describe("Telnyx event normalization", () => {
	it("extracts challenge digits from gather-ended payloads", () => {
		const event = normalizeTelnyxEvent({
			data: {
				event_type: "call.gather.ended",
				payload: {
					call_control_id: "test-call-control-id",
					call_session_id: "test-call-session-id",
					from: "+18005551234",
					to: "+18005550000",
					digits: "5"
				}
			}
		});

		expect(event.eventType).toBe("call.gather.ended");
		expect(event.callControlId).toBe("test-call-control-id");
		expect(event.digits).toBe("5");
		expect(shouldHandleTelnyxChallengeResponse(event)).toBe(true);
	});
});
