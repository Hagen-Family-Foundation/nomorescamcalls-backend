import type { UserRecord } from "./users";

export interface ApprovedCallDestination {
	destinationType: "app" | "unavailable";
	destination: string | null;
	reason: string;
}

export function planApprovedCallDestination(
	user: UserRecord | null
): ApprovedCallDestination {
	if (!user) {
		return {
			destinationType: "unavailable",
			destination: null,
			reason: "No active user was found for the incoming screening number."
		};
	}

	if (!user.appIdentity) {
		return {
			destinationType: "unavailable",
			destination: null,
			reason: "Protected user does not have an app identity yet."
		};
	}

	return {
		destinationType: "app",
		destination: user.appIdentity,
		reason: "Approved caller should be routed to the protected user's app identity."
	};
}
