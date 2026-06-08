import { hashPhoneNumber } from "../utils/hash";

export async function recordScamSignal(
	db: D1Database,
	phoneNumber: string,
	signalType: string,
	confidence = 1.0,
	source = "system"
): Promise<void> {
	const callerHash = await hashPhoneNumber(phoneNumber);

	await db
		.prepare(
			"INSERT INTO scam_signals (caller_hash, signal_type, confidence, source) VALUES (?, ?, ?, ?)"
		)
		.bind(
			callerHash,
			signalType,
			confidence,
			source
		)
		.run();
}
