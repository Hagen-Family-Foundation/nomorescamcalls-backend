import type { TelnyxCallEvent } from "./telnyxEvents";
import type { TelnyxPlannedAction } from "./telnyxActions";

export type TelnyxCommandType = "answer" | "transfer" | "gather" | "hangup" | "noop";

export interface TelnyxPlannedCommand {
	mode: "simulated";
	command: TelnyxCommandType;
	callControlId: string;
	callSessionId: string;
	reason: string;
	safetyNote: string;
}

export interface TelnyxExecutionPlan {
	mode: "simulated";
	action: TelnyxPlannedAction["action"];
	commands: TelnyxPlannedCommand[];
	reason: string;
}

function command(
	event: TelnyxCallEvent,
	command: TelnyxCommandType,
	reason: string,
	safetyNote: string
): TelnyxPlannedCommand {
	return {
		mode: "simulated",
		command,
		callControlId: event.callControlId,
		callSessionId: event.callSessionId,
		reason,
		safetyNote
	};
}

export function planTelnyxExecution(
	event: TelnyxCallEvent,
	plannedAction: TelnyxPlannedAction
): TelnyxExecutionPlan {
	if (!event.callControlId) {
		return {
			mode: "simulated",
			action: plannedAction.action,
			commands: [
				command(
					event,
					"noop",
					"Missing call_control_id; cannot safely plan Telnyx Call Control command.",
					"No live Telnyx command will be attempted."
				)
			],
			reason: "Missing call_control_id."
		};
	}

	if (plannedAction.action === "allow") {
		return {
			mode: "simulated",
			action: "allow",
			commands: [
				command(
					event,
					"transfer",
					"Approved caller should be transferred to the protected user's Telnyx WebRTC app identity.",
					"Transfer is guarded by TELNYX_LIVE_EXECUTION and remains disabled unless explicitly enabled."
				)
			],
			reason: "Allow path uses direct transfer."
		};
	}

	if (plannedAction.action === "block") {
		return {
			mode: "simulated",
			action: "block",
			commands: [
				command(
					event,
					"hangup",
					"Blocked caller should be hung up before ringing the user.",
					"Hangup is guarded by TELNYX_LIVE_EXECUTION and remains disabled unless explicitly enabled."
				)
			],
			reason: "Block path uses hangup."
		};
	}

	return {
		mode: "simulated",
		action: "challenge",
		commands: [
			command(
				event,
				"answer",
				"Challenge path must answer the call before gather_using_speak.",
				"Answer is guarded by TELNYX_LIVE_EXECUTION and remains disabled unless explicitly enabled."
			),
			command(
				event,
				"gather",
				"Caller should receive a short verification challenge before being allowed through.",
				"Gather/speak challenge is guarded by TELNYX_LIVE_EXECUTION and remains disabled unless explicitly enabled."
			)
		],
		reason: "Challenge path requires answer before gather."
	};
}

export function planTelnyxCommand(
	event: TelnyxCallEvent,
	plannedAction: TelnyxPlannedAction
): TelnyxPlannedCommand {
	return planTelnyxExecution(event, plannedAction).commands[0];
}
