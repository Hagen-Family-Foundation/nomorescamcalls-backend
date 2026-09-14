import type { TelnyxHttpClientConfig } from "./telnyxHttpClient";
import {
	LEGACY_EXCLUDED_SYSTEM_NUMBER,
	SYSTEM_NUMBER_AREA_CODE,
	SYSTEM_NUMBER_COUNTRY,
	SYSTEM_NUMBER_POOL_TAG,
	SYSTEM_NUMBER_TYPE,
	WORKING_TEST_SYSTEM_NUMBER,
	findSystemNumber,
	listSystemNumbers,
	promoteVerifiedSystemNumber,
	recordSystemNumberVerification,
	registerQuarantinedSystemNumber,
	type SystemNumberRecord
} from "./systemNumberPool";
import {
	acquireSystemNumberReplenishment,
	claimSystemNumberReplenishmentStage,
	findInFlightSystemNumberReplenishment,
	updateSystemNumberReplenishment,
	type SystemNumberReplenishmentRecord
} from "./systemNumberReplenishments";
import {
	configureTelnyxSystemNumbers,
	createTelnyxSystemNumberOrder,
	disableTelnyxSystemNumberVoicemail,
	listTelnyxSystemNumbers,
	retrieveTelnyxSystemNumber,
	retrieveTelnyxSystemNumberConfigurationJob,
	retrieveTelnyxSystemNumberOrder,
	retrieveTelnyxSystemNumberVoiceCapability,
	retrieveTelnyxSystemNumberVoiceSettings,
	retrieveTelnyxSystemNumberVoicemailState,
	type TelnyxSystemNumber,
	type TelnyxSystemNumberVoiceSettings
} from "./telnyxSystemNumbersClient";

export interface SystemNumberProviderConfig extends TelnyxHttpClientConfig {
	voiceApplicationId?: string;
}

export interface SystemNumberVerificationResult {
	verified: boolean;
	reasons: string[];
}

export function evaluateSystemNumberReadiness(
	number: TelnyxSystemNumber,
	voice: TelnyxSystemNumberVoiceSettings,
	voiceApplicationId: string
): SystemNumberVerificationResult {
	const reasons: string[] = [];
	if (number.status !== "active") reasons.push("provider_status_not_active");
	if (number.country !== SYSTEM_NUMBER_COUNTRY) reasons.push("provider_country_not_us");
	if (number.phoneNumberType !== SYSTEM_NUMBER_TYPE) reasons.push("provider_number_not_local");
	if (!number.phoneNumber.startsWith(`+1${SYSTEM_NUMBER_AREA_CODE}`)) {
		reasons.push("provider_number_not_913");
	}
	if (!number.voiceCapable) {
		reasons.push("provider_number_not_voice_capable");
	}
	if (
		number.connectionId !== voiceApplicationId
		|| voice.connectionId !== voiceApplicationId
	) {
		reasons.push("provider_voice_application_mismatch");
	}
	if (
		number.inboundCallScreening !== "flag_calls"
		|| voice.inboundCallScreening !== "flag_calls"
	) {
		reasons.push("provider_inbound_screening_not_flag_calls");
	}
	if (
		number.callForwardingEnabled !== false
		|| voice.callForwardingEnabled !== false
	) {
		reasons.push("provider_call_forwarding_enabled");
	}
	if (voice.forwardingDestination !== null) reasons.push("provider_forwarding_destination_present");
	if (voice.translatedNumber !== null) reasons.push("provider_translated_destination_present");
	if (voice.voicemailEnabled !== false) reasons.push("provider_voicemail_not_confirmed_inactive");
	if (
		number.callRecordingEnabled !== false
		|| voice.inboundCallRecordingEnabled !== false
	) {
		reasons.push("provider_automatic_recording_not_disabled");
	}
	if (
		number.cnamListingEnabled !== false
		|| voice.cnamListingEnabled !== false
	) {
		reasons.push("provider_cnam_listing_not_disabled");
	}
	if (
		number.callerIdNameEnabled !== false
		|| voice.callerIdNameEnabled !== false
	) {
		reasons.push("provider_incoming_cnam_not_disabled");
	}
	if (number.deletionLockEnabled !== true) reasons.push("provider_deletion_lock_not_enabled");
	if (!number.tags.includes(SYSTEM_NUMBER_POOL_TAG)) reasons.push("provider_pool_tag_missing");

	return { verified: reasons.length === 0, reasons };
}

export async function verifySystemNumberWithProvider(
	db: D1Database,
	record: SystemNumberRecord,
	config: SystemNumberProviderConfig
): Promise<SystemNumberVerificationResult> {
	if (!config.voiceApplicationId) {
		throw new Error("TELNYX_VOICE_APPLICATION_ID is required for System Number verification");
	}
	if (!record.providerNumberId) {
		const result = { verified: false, reasons: ["provider_number_id_missing"] };
		await recordSystemNumberVerification(db, record.phoneNumber, {
			verified: false,
			reason: result.reasons.join(",")
		});
		return result;
	}

	try {
		const [number, voice, voicemailEnabled, voiceCapable] = await Promise.all([
			retrieveTelnyxSystemNumber(config, record.providerNumberId),
			retrieveTelnyxSystemNumberVoiceSettings(config, record.providerNumberId),
			retrieveTelnyxSystemNumberVoicemailState(config, record.providerNumberId),
			retrieveTelnyxSystemNumberVoiceCapability(config, record.phoneNumber)
		]);
		const result = number.phoneNumber === record.phoneNumber
			? evaluateSystemNumberReadiness(
				{ ...number, voiceCapable },
				{ ...voice, voicemailEnabled },
				config.voiceApplicationId
			)
			: { verified: false, reasons: ["provider_phone_number_mismatch"] };
		await recordSystemNumberVerification(db, record.phoneNumber, {
			verified: result.verified,
			providerNumberId: number.providerNumberId,
			reason: result.reasons.join(",") || null
		});
		return result;
	} catch (error) {
		const reason = error instanceof Error ? error.message : "provider_verification_failed";
		await recordSystemNumberVerification(db, record.phoneNumber, {
			verified: false,
			reason
		});
		return { verified: false, reasons: [reason] };
	}
}

export interface SystemNumberReconciliationResult {
	discovered: number;
	verified: number;
	quarantined: number;
	failed: number;
}

export async function reconcileSystemNumbers(
	db: D1Database,
	config: SystemNumberProviderConfig
): Promise<SystemNumberReconciliationResult> {
	const providerNumbers = await listTelnyxSystemNumbers(config, {
		tag: SYSTEM_NUMBER_POOL_TAG
	});
	let discovered = 0;
	for (const providerNumber of providerNumbers) {
		if (
			providerNumber.phoneNumber === LEGACY_EXCLUDED_SYSTEM_NUMBER
			|| providerNumber.phoneNumber === WORKING_TEST_SYSTEM_NUMBER
		) {
			continue;
		}
		if (!await findSystemNumber(db, providerNumber.phoneNumber)) {
			await registerQuarantinedSystemNumber(db, {
				providerNumberId: providerNumber.providerNumberId,
				phoneNumber: providerNumber.phoneNumber,
				reason: "provider_discovery_requires_verification"
			});
			discovered += 1;
		}
	}

	let verified = 0;
	let quarantined = 0;
	let failed = 0;
	for (const record of await listSystemNumbers(db)) {
		if (
			record.lifecycleState === "ineligible"
			|| (
				record.phoneNumber === WORKING_TEST_SYSTEM_NUMBER
				&& record.lifecycleState !== "assigned"
			)
		) {
			continue;
		}
		const result = await verifySystemNumberWithProvider(db, record, config);
		if (result.verified) {
			verified += 1;
			if (record.lifecycleState === "quarantined") {
				await promoteVerifiedSystemNumber(db, record.phoneNumber);
			}
		} else {
			failed += 1;
			if (record.lifecycleState !== "assigned") quarantined += 1;
		}
	}

	return { discovered, verified, quarantined, failed };
}

const PENDING_ORDER_STATUSES = new Set(["pending", "processing"]);
const SUCCESS_ORDER_STATUSES = new Set(["success", "partial_success"]);
const PENDING_JOB_STATUSES = new Set(["pending", "processing", "queued"]);
const SUCCESS_JOB_STATUSES = new Set(["completed", "success", "partial_success"]);

export interface SystemNumberMaintenanceResult {
	action: "not_required" | "acquired" | "advanced" | "waiting" | "failed";
	replenishment: SystemNumberReplenishmentRecord | null;
	reason: string;
}

async function advanceOrdering(
	db: D1Database,
	replenishment: SystemNumberReplenishmentRecord,
	config: SystemNumberProviderConfig
): Promise<SystemNumberMaintenanceResult> {
	if (!config.voiceApplicationId) {
		throw new Error("TELNYX_VOICE_APPLICATION_ID is required for replenishment");
	}
	const claimed = await claimSystemNumberReplenishmentStage(
		db,
		replenishment.id,
		"ordering",
		"submitting_order"
	);
	if (!claimed) {
		return { action: "waiting", replenishment, reason: "provider_order_submission_claimed" };
	}
	try {
		const order = await createTelnyxSystemNumberOrder(
			config,
			config.voiceApplicationId,
			replenishment.providerCustomerReference
		);
		const updated = await updateSystemNumberReplenishment(db, claimed.id, {
			status: "fulfilling",
			providerOrderId: order.providerOrderId,
			providerAllocatedCount: order.allocatedCount,
			submittedAt: new Date().toISOString()
		});
		return { action: "advanced", replenishment: updated, reason: "provider_order_submitted" };
	} catch (error) {
		const reason = error instanceof Error ? error.message : "provider_order_submission_failed";
		const updated = await updateSystemNumberReplenishment(db, claimed.id, {
			status: "submitting_order",
			lastError: reason
		});
		return { action: "failed", replenishment: updated, reason };
	}
}

async function advanceFulfilling(
	db: D1Database,
	replenishment: SystemNumberReplenishmentRecord,
	config: SystemNumberProviderConfig
): Promise<SystemNumberMaintenanceResult> {
	if (!replenishment.providerOrderId || !config.voiceApplicationId) {
		throw new Error("In-flight replenishment is missing provider correlation");
	}
	const order = await retrieveTelnyxSystemNumberOrder(config, replenishment.providerOrderId);
	if (PENDING_ORDER_STATUSES.has(order.status)) {
		return { action: "waiting", replenishment, reason: "provider_order_pending" };
	}
	if (!SUCCESS_ORDER_STATUSES.has(order.status)) {
		const updated = await updateSystemNumberReplenishment(db, replenishment.id, {
			status: "failed",
			providerAllocatedCount: order.allocatedCount,
			lastError: `provider_order_${order.status}`
		});
		return { action: "failed", replenishment: updated, reason: `provider_order_${order.status}` };
	}
	const claimed = await claimSystemNumberReplenishmentStage(
		db,
		replenishment.id,
		"fulfilling",
		"submitting_configuration"
	);
	if (!claimed) {
		return { action: "waiting", replenishment, reason: "provider_configuration_submission_claimed" };
	}

	const numbers = await listTelnyxSystemNumbers(config, {
		customerReference: claimed.providerCustomerReference
	});
	if (numbers.length < order.allocatedCount) {
		const updated = await updateSystemNumberReplenishment(db, claimed.id, {
			status: "fulfilling",
			providerAllocatedCount: order.allocatedCount,
			lastError: "provider_allocated_numbers_not_yet_visible"
		});
		return {
			action: "waiting",
			replenishment: updated,
			reason: "provider_allocated_numbers_not_yet_visible"
		};
	}
	for (const number of numbers) {
		await registerQuarantinedSystemNumber(db, {
			providerNumberId: number.providerNumberId,
			phoneNumber: number.phoneNumber,
			replenishmentId: claimed.id,
			reason: "provider_configuration_pending"
		});
	}
	if (numbers.length === 0) {
		const updated = await updateSystemNumberReplenishment(db, claimed.id, {
			status: "failed",
			providerAllocatedCount: order.allocatedCount,
			lastError: "provider_order_returned_no_numbers"
		});
		return { action: "failed", replenishment: updated, reason: "provider_order_returned_no_numbers" };
	}

	let job;
	try {
		for (const number of numbers) {
			await disableTelnyxSystemNumberVoicemail(config, number.providerNumberId);
		}
		job = await configureTelnyxSystemNumbers(
			config,
			numbers.map((number) => number.providerNumberId),
			config.voiceApplicationId
		);
	} catch (error) {
		const reason = error instanceof Error
			? error.message
			: "provider_configuration_submission_failed";
		const updated = await updateSystemNumberReplenishment(db, claimed.id, {
			status: "fulfilling",
			providerAllocatedCount: numbers.length,
			lastError: reason
		});
		return { action: "failed", replenishment: updated, reason };
	}
	const updated = await updateSystemNumberReplenishment(db, claimed.id, {
		status: "configuring",
		providerConfigurationJobId: job.providerJobId,
		providerAllocatedCount: numbers.length
	});
	return { action: "advanced", replenishment: updated, reason: "provider_configuration_submitted" };
}

async function advanceConfiguring(
	db: D1Database,
	replenishment: SystemNumberReplenishmentRecord,
	config: SystemNumberProviderConfig
): Promise<SystemNumberMaintenanceResult> {
	if (!replenishment.providerConfigurationJobId) {
		throw new Error("In-flight replenishment is missing its configuration job");
	}
	const job = await retrieveTelnyxSystemNumberConfigurationJob(
		config,
		replenishment.providerConfigurationJobId
	);
	if (PENDING_JOB_STATUSES.has(job.status)) {
		return { action: "waiting", replenishment, reason: "provider_configuration_pending" };
	}
	if (!SUCCESS_JOB_STATUSES.has(job.status)) {
		const updated = await updateSystemNumberReplenishment(db, replenishment.id, {
			status: "failed",
			lastError: `provider_configuration_${job.status}`
		});
		return { action: "failed", replenishment: updated, reason: `provider_configuration_${job.status}` };
	}
	const updated = await updateSystemNumberReplenishment(db, replenishment.id, {
		status: "verifying"
	});
	return { action: "advanced", replenishment: updated, reason: "provider_configuration_completed" };
}

async function advanceVerifying(
	db: D1Database,
	replenishment: SystemNumberReplenishmentRecord,
	config: SystemNumberProviderConfig
): Promise<SystemNumberMaintenanceResult> {
	const claimed = await claimSystemNumberReplenishmentStage(
		db,
		replenishment.id,
		"verifying",
		"finalizing"
	);
	if (!claimed) {
		return { action: "waiting", replenishment, reason: "provider_verification_claimed" };
	}
	const records = (await listSystemNumbers(db))
		.filter((record) => record.replenishmentId === claimed.id);
	let verifiedReadyCount = 0;
	for (const record of records) {
		const verification = await verifySystemNumberWithProvider(db, record, config);
		if (verification.verified) {
			await promoteVerifiedSystemNumber(db, record.phoneNumber);
			verifiedReadyCount += 1;
		}
	}
	const status = verifiedReadyCount === claimed.requestedQuantity
		? "completed"
		: verifiedReadyCount > 0
			? "partial"
			: "failed";
	const updated = await updateSystemNumberReplenishment(db, claimed.id, {
		status,
		verifiedReadyCount,
		lastError: status === "completed" ? null : "replenishment_not_fully_verified"
	});
	return {
		action: status === "failed" ? "failed" : "advanced",
		replenishment: updated,
		reason: `replenishment_${status}`
	};
}

export async function maintainSystemNumberPool(
	db: D1Database,
	config: SystemNumberProviderConfig,
	requestKey?: string
): Promise<SystemNumberMaintenanceResult> {
	let replenishment = await findInFlightSystemNumberReplenishment(db);
	if (!replenishment) {
		replenishment = await acquireSystemNumberReplenishment(db, requestKey);
		if (!replenishment) {
			return { action: "not_required", replenishment: null, reason: "ready_count_above_threshold" };
		}
		return advanceOrdering(db, replenishment, config);
	}

	if (replenishment.status === "ordering") {
		return advanceOrdering(db, replenishment, config);
	}
	if (replenishment.status === "fulfilling") {
		return advanceFulfilling(db, replenishment, config);
	}
	if (replenishment.status === "configuring") {
		return advanceConfiguring(db, replenishment, config);
	}
	if (replenishment.status === "verifying") {
		return advanceVerifying(db, replenishment, config);
	}
	if (
		replenishment.status === "submitting_order"
		|| replenishment.status === "submitting_configuration"
		|| replenishment.status === "finalizing"
	) {
		return { action: "waiting", replenishment, reason: `${replenishment.status}_in_progress` };
	}
	return { action: "not_required", replenishment: null, reason: "no_in_flight_replenishment" };
}
