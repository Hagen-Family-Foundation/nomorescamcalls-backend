import type { ProtectedLineRecord } from "./protectedLines";

export interface ApprovedCallDestination {
	destinationType: "app" | "unavailable";
	destination: string | null;
	systemNumber: string | null;
	reason: string;
}

export function planApprovedCallDestination(
	protectedLine: ProtectedLineRecord | null
): ApprovedCallDestination {
	if (!protectedLine) {
		return {
			destinationType: "unavailable",
			destination: null,
			systemNumber: null,
			reason: "No active protected line was found for the incoming System Number."
		};
	}

	if (!protectedLine.sipUsername) {
		return {
			destinationType: "unavailable",
			destination: null,
			systemNumber: protectedLine.systemNumber,
			reason: "Protected line does not have a SIP username yet."
		};
	}

	return {
		destinationType: "app",
		destination: protectedLine.sipUsername,
		systemNumber: protectedLine.systemNumber,
		reason: "Approved caller should be routed to the exact protected line's SIP username."
	};
}
