import { hashPhoneNumber } from "../utils/hash";
import { findConfirmedScamNumber, type ConfirmedScamNumber } from "./confirmedScams";
import { updateCallerReputation, type ReputationResult } from "./reputation";

export type CallerEvidenceClass =
	| "allow_list"
	| "confirmed_scam"
	| "user_block_list"
	| "unknown";

export interface AllowListEvidence {
	reason: string;
}

export interface UserBlockListEvidence {
	reason: string;
}

export interface BaselineCallEvidence {
	phoneNumber: string;
	callerHash: string;
	userId: number | null;
	evidenceClass: CallerEvidenceClass;
	allowList: AllowListEvidence | null;
	confirmedScam: ConfirmedScamNumber | null;
	userBlockList: UserBlockListEvidence | null;
	reputation: ReputationResult | null;
}

export async function collectBaselineCallEvidence(
	phoneNumber: string,
	db: D1Database,
	userId: number | null = null
): Promise<BaselineCallEvidence> {
	const callerHash = await hashPhoneNumber(phoneNumber);

	const allowed = await db
		.prepare(
			"SELECT reason FROM allow_list WHERE phone_number = ? AND user_id IS ?"
		)
		.bind(phoneNumber, userId)
		.first<{ reason: string }>();

	if (allowed) {
		return {
			phoneNumber,
			callerHash,
			userId,
			evidenceClass: "allow_list",
			allowList: {
				reason: allowed.reason
			},
			confirmedScam: null,
			userBlockList: null,
			reputation: null
		};
	}

	const confirmedScam = await findConfirmedScamNumber(
		db,
		phoneNumber
	);

	if (confirmedScam) {
		return {
			phoneNumber,
			callerHash,
			userId,
			evidenceClass: "confirmed_scam",
			allowList: null,
			confirmedScam,
			userBlockList: null,
			reputation: null
		};
	}

	const blocked = await db
		.prepare(
			"SELECT reason FROM block_list WHERE phone_number = ? AND user_id IS ?"
		)
		.bind(phoneNumber, userId)
		.first<{ reason: string }>();

	if (blocked) {
		return {
			phoneNumber,
			callerHash,
			userId,
			evidenceClass: "user_block_list",
			allowList: null,
			confirmedScam: null,
			userBlockList: {
				reason: blocked.reason
			},
			reputation: null
		};
	}

	const reputation = await updateCallerReputation(phoneNumber, db);

	return {
		phoneNumber,
		callerHash,
		userId,
		evidenceClass: "unknown",
		allowList: null,
		confirmedScam: null,
		userBlockList: null,
		reputation
	};
}
