import type { ProtectedLineRecord } from "./protectedLines";

export interface ApprovedCallDestination {
	destinationType: "app" | "unavailable";
	destination: string | null;
	screeningNumber: string | null;
	reason: string;
}

export function planApprovedCallDestination(
	protectedLine: ProtectedLineRecord | null
): ApprovedCallDestination {
	if (!protectedLine) {
		return {
			destinationType: "unavailable",
			destination: null,
			screeningNumber: null,
			reason: "No active protected line was found for the incoming screening number."
		};
	}

	if (!protectedLine.sipUsername) {
		return {
			destinationType: "unavailable",
			destination: null,
			screeningNumber: protectedLine.screeningNumber,
			reason: "Protected line does not have a SIP username yet."
		};
	}

	return {
		destinationType: "app",
		destination: protectedLine.sipUsername,
		screeningNumber: protectedLine.screeningNumber,
		reason: "Approved caller should be routed to the exact protected line's SIP username."
	};
}
