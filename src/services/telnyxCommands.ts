import type { TelnyxCallEvent } from "./telnyxEvents";
import type { TelnyxPlannedAction } from "./telnyxActions";

export type TelnyxCommandType = "transfer" | "gather" | "hangup" | "noop";

export interface TelnyxPlannedCommand {
	mode: "simulated";
	command: TelnyxCommandType;
	callControlId: string;
	callSessionId: string;
	reason: string;
	safetyNote: string;
}

export function planTelnyxCommand(
	event: TelnyxCallEvent,
	plannedAction: TelnyxPlannedAction
): TelnyxPlannedCommand {
	if (!event.callControlId) {
		return {
			mode: "simulated",
			command: "noop",
			callControlId: event.callControlId,
			callSessionId: event.callSessionId,
			reason: "Missing call_control_id; cannot safely plan Telnyx Call Control command.",
			safetyNote: "No live Telnyx command will be attempted."
		};
	}

	if (plannedAction.action === "allow") {
		return {
			mode: "simulated",
			command: "transfer",
			callControlId: event.callControlId,
			callSessionId: event.callSessionId,
			reason: "Approved caller would be transferred to the protected user's Telnyx WebRTC app identity.",
			safetyNote: "Transfer is guarded by TELNYX_LIVE_EXECUTION and remains disabled unless explicitly enabled."
		};
	}

	if (plannedAction.action === "block") {
		return {
			mode: "simulated",
			command: "hangup",
			callControlId: event.callControlId,
			callSessionId: event.callSessionId,
			reason: "Blocked caller would be rejected or hung up before ringing the user.",
			safetyNote: "Hangup is simulation-only and disabled."
		};
	}

	return {
		mode: "simulated",
		command: "gather",
		callControlId: event.callControlId,
		callSessionId: event.callSessionId,
		reason: "Caller would receive a short verification challenge before being allowed through.",
		safetyNote: "Gather/speak challenge is simulation-only and disabled."
	};
}
