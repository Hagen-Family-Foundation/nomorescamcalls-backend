type ScreeningAction = "allow" | "challenge" | "block";

export type TelnyxPlannedAction = {
	mode: "simulated";
	action: ScreeningAction;
	telnyxBehavior: string;
	reason: string;
	nextStep: string;
};

export function planTelnyxAction(action: string): TelnyxPlannedAction {
	if (action === "allow") {
		return {
			mode: "simulated",
			action: "allow",
			telnyxBehavior: "route_to_approved_app_endpoint",
			reason: "Caller passed screening.",
			nextStep: "Transfer approved call to the protected user app/WebRTC destination."
		};
	}

	if (action === "block") {
		return {
			mode: "simulated",
			action: "block",
			telnyxBehavior: "reject_or_hangup_call",
			reason: "Caller failed screening.",
			nextStep: "Future: reject or hang up call without ringing user."
		};
	}

	return {
		mode: "simulated",
		action: "challenge",
		telnyxBehavior: "play_cost_conscious_challenge",
		reason: "Caller needs verification before user is disturbed.",
		nextStep: "Future: answer call and run short Telnyx gather/speak challenge."
	};
}
