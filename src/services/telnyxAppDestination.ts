import type { ApprovedCallDestination } from "./routing";

export interface TelnyxAppDestinationPlan {
	provider: "telnyx";
	destinationType: "app" | "unavailable";
	sipUsername: string | null;
	simulatedDestination: string | null;
	liveApiReady: boolean;
	reason: string;
}

export function planTelnyxAppDestination(
	approvedDestination: ApprovedCallDestination | null
): TelnyxAppDestinationPlan {
	if (!approvedDestination || approvedDestination.destinationType !== "app" || !approvedDestination.destination) {
		return {
			provider: "telnyx",
			destinationType: "unavailable",
			sipUsername: null,
			simulatedDestination: null,
			liveApiReady: false,
			reason: approvedDestination?.reason ?? "No approved app destination was available."
		};
	}

	return {
		provider: "telnyx",
		destinationType: "app",
		sipUsername: approvedDestination.destination,
		simulatedDestination: `telnyx_sip_username:${approvedDestination.destination}`,
		liveApiReady: true,
		reason: "Approved caller should be routed to this Telnyx SIP username using Telnyx Call Control transfer."
	};
}
