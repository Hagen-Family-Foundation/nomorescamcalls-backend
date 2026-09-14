import {
	getTelnyxJson,
	patchTelnyxJson,
	postTelnyxJson,
	type TelnyxHttpClientConfig
} from "./telnyxHttpClient";
import {
	SYSTEM_NUMBER_AREA_CODE,
	SYSTEM_NUMBER_COUNTRY,
	SYSTEM_NUMBER_POOL_TAG,
	SYSTEM_NUMBER_REORDER_QUANTITY,
	SYSTEM_NUMBER_TYPE
} from "./systemNumberPool";

export interface TelnyxSystemNumber {
	providerNumberId: string;
	phoneNumber: string;
	status: string | null;
	country: string | null;
	phoneNumberType: string | null;
	connectionId: string | null;
	tags: string[];
	deletionLockEnabled: boolean | null;
	voiceCapable: boolean;
	callForwardingEnabled: boolean | null;
	cnamListingEnabled: boolean | null;
	callerIdNameEnabled: boolean | null;
	callRecordingEnabled: boolean | null;
	inboundCallScreening: string | null;
	customerReference: string | null;
}

export interface TelnyxSystemNumberVoiceSettings {
	connectionId: string | null;
	translatedNumber: string | null;
	callForwardingEnabled: boolean | null;
	forwardingDestination: string | null;
	cnamListingEnabled: boolean | null;
	callerIdNameEnabled: boolean | null;
	inboundCallRecordingEnabled: boolean | null;
	inboundCallScreening: string | null;
	voicemailEnabled: boolean | null;
}

export interface TelnyxSystemNumberPage {
	numbers: TelnyxSystemNumber[];
	pageNumber: number;
	totalPages: number;
}

function stringOrNull(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

function booleanOrNull(value: unknown): boolean | null {
	return typeof value === "boolean" ? value : null;
}

function featureIncludesVoice(value: unknown): boolean {
	if (Array.isArray(value)) {
		return value.some((feature) =>
			typeof feature === "string"
				? feature.toLowerCase() === "voice"
				: Boolean(
					feature
					&& typeof feature === "object"
					&& (
						(feature as { name?: unknown }).name === "voice"
						|| (feature as { voice?: unknown }).voice === true
					)
				)
		);
	}
	return Boolean(
		value
		&& typeof value === "object"
		&& (value as { voice?: unknown }).voice === true
	);
}

export function normalizeTelnyxSystemNumber(value: unknown): TelnyxSystemNumber | null {
	if (!value || typeof value !== "object") {
		return null;
	}
	const row = value as Record<string, unknown>;
	const providerNumberId = stringOrNull(row.id);
	const phoneNumber = stringOrNull(row.phone_number ?? row.number);
	if (!providerNumberId || !phoneNumber) {
		return null;
	}

	return {
		providerNumberId,
		phoneNumber,
		status: stringOrNull(row.status),
		country: stringOrNull(row.country_iso_alpha2 ?? row.country_iso),
		phoneNumberType: stringOrNull(row.phone_number_type),
		connectionId: stringOrNull(row.connection_id ?? row.voice_application_id),
		tags: Array.isArray(row.tags)
			? row.tags.filter((tag): tag is string => typeof tag === "string")
			: [],
		deletionLockEnabled: booleanOrNull(row.deletion_lock_enabled),
		voiceCapable: featureIncludesVoice(row.features),
		callForwardingEnabled: booleanOrNull(row.call_forwarding_enabled),
		cnamListingEnabled: booleanOrNull(row.cnam_listing_enabled),
		callerIdNameEnabled: booleanOrNull(row.caller_id_name_enabled),
		callRecordingEnabled: booleanOrNull(row.call_recording_enabled),
		inboundCallScreening: stringOrNull(row.inbound_call_screening),
		customerReference: stringOrNull(row.customer_reference)
	};
}

export function normalizeTelnyxVoiceSettings(
	value: unknown
): TelnyxSystemNumberVoiceSettings | null {
	if (!value || typeof value !== "object") {
		return null;
	}
	const row = value as Record<string, unknown>;
	const forwarding = row.call_forwarding && typeof row.call_forwarding === "object"
		? row.call_forwarding as Record<string, unknown>
		: {};
	const cnam = row.cnam_listing && typeof row.cnam_listing === "object"
		? row.cnam_listing as Record<string, unknown>
		: {};
	const recording = row.call_recording && typeof row.call_recording === "object"
		? row.call_recording as Record<string, unknown>
		: {};

	return {
		connectionId: stringOrNull(row.connection_id),
		translatedNumber: stringOrNull(row.translated_number),
		callForwardingEnabled: booleanOrNull(
			forwarding.call_forwarding_enabled ?? row.call_forwarding_enabled
		),
		forwardingDestination: stringOrNull(forwarding.forwards_to),
		cnamListingEnabled: booleanOrNull(
			cnam.cnam_listing_enabled ?? row.cnam_listing_enabled
		),
		callerIdNameEnabled: booleanOrNull(row.caller_id_name_enabled),
		inboundCallRecordingEnabled: booleanOrNull(
			recording.inbound_call_recording_enabled ?? row.call_recording_enabled
		),
		inboundCallScreening: stringOrNull(row.inbound_call_screening),
		voicemailEnabled: booleanOrNull(row.voicemail_enabled)
	};
}

function pagination(payload: unknown): { pageNumber: number; totalPages: number } {
	if (!payload || typeof payload !== "object") {
		throw new Error("Telnyx phone-number response was missing pagination metadata");
	}
	const meta = (payload as { meta?: unknown }).meta;
	if (!meta || typeof meta !== "object") {
		throw new Error("Telnyx phone-number response was missing pagination metadata");
	}
	const page = (meta as { page_number?: unknown }).page_number;
	const total = (meta as { total_pages?: unknown }).total_pages;
	if (
		typeof page !== "number"
		|| !Number.isInteger(page)
		|| typeof total !== "number"
		|| !Number.isInteger(total)
	) {
		throw new Error("Telnyx phone-number pagination metadata was incomplete");
	}
	return {
		pageNumber: page,
		totalPages: total
	};
}

export async function listTelnyxSystemNumbers(
	config: TelnyxHttpClientConfig,
	filters: { tag?: string; customerReference?: string } = {}
): Promise<TelnyxSystemNumber[]> {
	const numbers: TelnyxSystemNumber[] = [];
	const seenIds = new Set<string>();
	let pageNumber = 1;
	let totalPages = 1;

	do {
		const query = new URLSearchParams({
			"page[number]": String(pageNumber),
			"page[size]": "250"
		});
		if (filters.tag) {
			query.set("filter[tag]", filters.tag);
		}
		if (filters.customerReference) {
			query.set("filter[customer_reference]", filters.customerReference);
		}
		const response = await getTelnyxJson(
			config,
			`/phone_numbers?${query.toString()}`
		);
		if (!response.ok) {
			throw new Error(`Telnyx phone-number page ${pageNumber} returned ${response.status}`);
		}
		const data = response.body && typeof response.body === "object"
			? (response.body as { data?: unknown }).data
			: null;
		if (!Array.isArray(data)) {
			throw new Error("Telnyx phone-number response did not contain a complete data page");
		}
		for (const value of data) {
			const number = normalizeTelnyxSystemNumber(value);
			if (number && !seenIds.has(number.providerNumberId)) {
				seenIds.add(number.providerNumberId);
				numbers.push(number);
			}
		}
		const page = pagination(response.body);
		if (page.pageNumber !== pageNumber || page.totalPages < pageNumber) {
			throw new Error("Telnyx phone-number pagination metadata was inconsistent");
		}
		totalPages = page.totalPages;
		pageNumber += 1;
	} while (pageNumber <= totalPages);

	return numbers;
}

export async function retrieveTelnyxSystemNumber(
	config: TelnyxHttpClientConfig,
	providerNumberId: string
): Promise<TelnyxSystemNumber> {
	const response = await getTelnyxJson(config, `/phone_numbers/${providerNumberId}`);
	if (!response.ok) {
		throw new Error(`Telnyx phone number returned ${response.status}`);
	}
	const data = response.body && typeof response.body === "object"
		? (response.body as { data?: unknown }).data
		: null;
	const number = normalizeTelnyxSystemNumber(data);
	if (!number) {
		throw new Error("Telnyx phone-number response was incomplete");
	}
	return number;
}

export async function retrieveTelnyxSystemNumberVoiceSettings(
	config: TelnyxHttpClientConfig,
	providerNumberId: string
): Promise<TelnyxSystemNumberVoiceSettings> {
	const response = await getTelnyxJson(
		config,
		`/phone_numbers/${providerNumberId}/voice`
	);
	if (!response.ok) {
		throw new Error(`Telnyx phone-number voice settings returned ${response.status}`);
	}
	const data = response.body && typeof response.body === "object"
		? (response.body as { data?: unknown }).data
		: null;
	const settings = normalizeTelnyxVoiceSettings(data);
	if (!settings) {
		throw new Error("Telnyx voice-settings response was incomplete");
	}
	return settings;
}

export async function retrieveTelnyxSystemNumberVoicemailState(
	config: TelnyxHttpClientConfig,
	providerNumberId: string
): Promise<boolean> {
	const response = await getTelnyxJson(
		config,
		`/phone_numbers/${providerNumberId}/voicemail`
	);
	if (!response.ok) {
		throw new Error(`Telnyx phone-number voicemail settings returned ${response.status}`);
	}
	const data = response.body && typeof response.body === "object"
		? (response.body as { data?: unknown }).data
		: null;
	if (
		!data
		|| typeof data !== "object"
		|| typeof (data as { enabled?: unknown }).enabled !== "boolean"
	) {
		throw new Error("Telnyx voicemail response was incomplete");
	}
	return (data as { enabled: boolean }).enabled;
}

export async function retrieveTelnyxSystemNumberVoiceCapability(
	config: TelnyxHttpClientConfig,
	phoneNumber: string
): Promise<boolean> {
	const response = await postTelnyxJson(config, "/numbers_features", {
		phone_numbers: [phoneNumber]
	});
	if (!response.ok) {
		throw new Error(`Telnyx number-features request returned ${response.status}`);
	}
	const data = response.body && typeof response.body === "object"
		? (response.body as { data?: unknown }).data
		: null;
	if (!Array.isArray(data)) {
		throw new Error("Telnyx number-features response was incomplete");
	}
	const exact = data.find((value) =>
		value
		&& typeof value === "object"
		&& stringOrNull((value as { phone_number?: unknown }).phone_number) === phoneNumber
	);
	if (
		!exact
		|| typeof exact !== "object"
		|| !Array.isArray((exact as { features?: unknown }).features)
	) {
		throw new Error("Telnyx number-features response omitted the requested number");
	}
	return (exact as { features: unknown[] }).features.some((feature) =>
		typeof feature === "string" && feature.toLowerCase() === "voice"
	);
}

export async function disableTelnyxSystemNumberVoicemail(
	config: TelnyxHttpClientConfig,
	providerNumberId: string
): Promise<void> {
	const response = await patchTelnyxJson(
		config,
		`/phone_numbers/${providerNumberId}/voicemail`,
		{ enabled: false }
	);
	if (!response.ok) {
		throw new Error(`Telnyx voicemail configuration returned ${response.status}`);
	}
	const data = response.body && typeof response.body === "object"
		? (response.body as { data?: unknown }).data
		: null;
	if (
		!data
		|| typeof data !== "object"
		|| (data as { enabled?: unknown }).enabled !== false
	) {
		throw new Error("Telnyx voicemail configuration was not confirmed disabled");
	}
}

export interface TelnyxOrderSnapshot {
	providerOrderId: string;
	status: string;
	allocatedCount: number;
}

function normalizeOrder(value: unknown): TelnyxOrderSnapshot | null {
	if (!value || typeof value !== "object") {
		return null;
	}
	const row = value as Record<string, unknown>;
	const providerOrderId = stringOrNull(row.id);
	if (!providerOrderId) {
		return null;
	}
	const groups = Array.isArray(row.ordering_groups) ? row.ordering_groups : [];
	const statuses = groups.map((group) =>
		group && typeof group === "object"
			? stringOrNull((group as { status?: unknown }).status)
			: null
	);
	if (statuses.length === 0 || statuses.some((status) => status === null)) {
		return null;
	}
	const status = statuses.every((candidate) => candidate === "success")
		? "success"
		: statuses.some((candidate) => candidate === "pending")
			? "pending"
			: statuses.some((candidate) => candidate === "success")
				? "partial_success"
				: statuses[0]!;
	return {
		providerOrderId,
		status,
		allocatedCount: groups.reduce((sum: number, group: unknown) => {
			if (!group || typeof group !== "object") {
				return sum;
			}
			const count = (group as { count_allocated?: unknown }).count_allocated;
			return sum + (typeof count === "number" ? count : 0);
		}, 0)
	};
}

export async function createTelnyxSystemNumberOrder(
	config: TelnyxHttpClientConfig,
	voiceApplicationId: string,
	customerReference: string
): Promise<TelnyxOrderSnapshot> {
	const response = await postTelnyxJson(config, "/inexplicit_number_orders", {
		ordering_groups: [{
			country_iso: SYSTEM_NUMBER_COUNTRY,
			count_requested: SYSTEM_NUMBER_REORDER_QUANTITY,
			phone_number_type: SYSTEM_NUMBER_TYPE,
			national_destination_code: SYSTEM_NUMBER_AREA_CODE,
			features: ["voice"],
			strategy: "always",
			exclude_held_numbers: true
		}],
		connection_id: voiceApplicationId,
		customer_reference: customerReference
	});
	if (!response.ok) {
		throw new Error(`Telnyx System Number order returned ${response.status}`);
	}
	const data = response.body && typeof response.body === "object"
		? (response.body as { data?: unknown }).data
		: null;
	const order = normalizeOrder(data);
	if (!order) {
		throw new Error("Telnyx System Number order response was incomplete");
	}
	return order;
}

export async function retrieveTelnyxSystemNumberOrder(
	config: TelnyxHttpClientConfig,
	providerOrderId: string
): Promise<TelnyxOrderSnapshot> {
	const response = await getTelnyxJson(
		config,
		`/inexplicit_number_orders/${providerOrderId}`
	);
	if (!response.ok) {
		throw new Error(`Telnyx System Number order returned ${response.status}`);
	}
	const data = response.body && typeof response.body === "object"
		? (response.body as { data?: unknown }).data
		: null;
	const order = normalizeOrder(data);
	if (!order) {
		throw new Error("Telnyx System Number order response was incomplete");
	}
	return order;
}

export interface TelnyxConfigurationJob {
	providerJobId: string;
	status: string;
}

function normalizeJob(value: unknown): TelnyxConfigurationJob | null {
	if (!value || typeof value !== "object") {
		return null;
	}
	const row = value as Record<string, unknown>;
	const providerJobId = stringOrNull(row.id);
	const status = stringOrNull(row.status);
	return providerJobId && status ? { providerJobId, status } : null;
}

export async function configureTelnyxSystemNumbers(
	config: TelnyxHttpClientConfig,
	providerNumberIds: string[],
	voiceApplicationId: string
): Promise<TelnyxConfigurationJob> {
	if (providerNumberIds.length === 0) {
		throw new Error("At least one Telnyx System Number is required for configuration");
	}
	const response = await postTelnyxJson(
		config,
		"/phone_numbers/jobs/update_phone_numbers",
		{
			phone_numbers: providerNumberIds,
			tags: [SYSTEM_NUMBER_POOL_TAG],
			connection_id: voiceApplicationId,
			deletion_lock_enabled: true,
			voice: {
				caller_id_name_enabled: false,
				call_forwarding: {
					call_forwarding_enabled: false,
					forwards_to: ""
				},
				translated_number: "",
				cnam_listing: {
					cnam_listing_enabled: false
				},
				call_recording: {
					inbound_call_recording_enabled: false
				},
				inbound_call_screening: "flag_calls"
			}
		}
	);
	if (!response.ok) {
		throw new Error(`Telnyx System Number configuration returned ${response.status}`);
	}
	const data = response.body && typeof response.body === "object"
		? (response.body as { data?: unknown }).data
		: null;
	const job = normalizeJob(data);
	if (!job) {
		throw new Error("Telnyx configuration-job response was incomplete");
	}
	return job;
}

export async function retrieveTelnyxSystemNumberConfigurationJob(
	config: TelnyxHttpClientConfig,
	providerJobId: string
): Promise<TelnyxConfigurationJob> {
	const response = await getTelnyxJson(
		config,
		`/phone_numbers/jobs/${providerJobId}`
	);
	if (!response.ok) {
		throw new Error(`Telnyx configuration job returned ${response.status}`);
	}
	const data = response.body && typeof response.body === "object"
		? (response.body as { data?: unknown }).data
		: null;
	const job = normalizeJob(data);
	if (!job) {
		throw new Error("Telnyx configuration-job response was incomplete");
	}
	return job;
}
