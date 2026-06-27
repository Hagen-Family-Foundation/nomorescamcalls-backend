import type { UserRecord } from "./users";

export interface ApprovedCallDestination {
	destinationType: "app" | "unavailable";
	destination: string | null;
	screeningNumber: string | null;
	reason: string;
}

export function planApprovedCallDestination(
	user: UserRecord | null
): ApprovedCallDestination {
	if (!user) {
		return {
			destinationType: "unavailable",
			destination: null,
			screeningNumber: null,
			reason: "No active user was found for the incoming screening number."
		};
	}

	if (!user.sipUsername) {
		return {
			destinationType: "unavailable",
			destination: null,
			screeningNumber: user.screeningNumber,
			reason: "Protected user does not have a SIP username yet."
		};
	}

	return {
		destinationType: "app",
		destination: user.sipUsername,
		screeningNumber: user.screeningNumber,
		reason: "Approved caller should be routed to the protected user's SIP username."
	};
}
