import type { ApprovedCallDestination } from "./routing";

export interface TelnyxAppDestinationPlan {
	provider: "telnyx";
	destinationType: "app" | "unavailable";
	appIdentity: string | null;
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
			appIdentity: null,
			simulatedDestination: null,
			liveApiReady: false,
			reason: approvedDestination?.reason ?? "No approved app destination was available."
		};
	}

	return {
		provider: "telnyx",
		destinationType: "app",
		appIdentity: approvedDestination.destination,
		simulatedDestination: `telnyx_app:${approvedDestination.destination}`,
		liveApiReady: true,
		reason: "Approved caller should be routed to this Telnyx app/WebRTC identity using Telnyx Call Control transfer."
	};
}
