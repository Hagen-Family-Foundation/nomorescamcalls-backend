import { hashPhoneNumber } from "../utils/hash";
import { findConfirmedScamNumber } from "./confirmedScams";
import { getCallerReputation } from "./reputation";
import { listSignalsForCaller } from "./signals";
import { listRecentCallEventsForCaller } from "./events";

export async function getCallerIntelligence(
	db: D1Database,
	phoneNumber: string
) {
	const callerHash = await hashPhoneNumber(phoneNumber);

	const [
		confirmedScam,
		reputation,
		signals,
		recentCalls
	] = await Promise.all([
		findConfirmedScamNumber(db, phoneNumber),
		getCallerReputation(db, callerHash),
		listSignalsForCaller(db, callerHash),
		listRecentCallEventsForCaller(db, callerHash)
	]);

	return {
		phoneNumber,
		callerHash,
		confirmedScam,
		reputation,
		signals,
		recentCalls
	};
}
