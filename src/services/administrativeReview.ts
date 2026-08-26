import {
	findProtectedLineById,
	findProtectedLineByPhoneNumber,
	listAccountLocations,
	listProtectedLinesForAccount,
	type ProtectedLineRecord
} from "./protectedLines";
import {
	findUserByIdIncludingInactive,
	type UserRecord
} from "./users";

const ADMINISTRATIVE_REVIEW_ROLES = new Set([
	"admin",
	"administrator"
]);

const REVIEW_SECTIONS = new Set([
	"account_family",
	"account",
	"locations",
	"protected_lines",
	"protected_line"
]);

const SENSITIVE_FIELD_PATTERN =
	/(password|token|secret|credential|api[_-]?key)/i;

export interface AdministrativeReviewSessionRecord {
	id: string;
	reviewerUserId: number;
	reviewerRole: string;
	accountUserId: number;
	initialProtectedLineId: number | null;
	startedAt: string;
	endedAt: string | null;
	durationSeconds: number | null;
}

export interface AdministrativeReviewLine {
	id: number;
	locationId: number;
	protectedPhoneNumber: string;
	callerFacingBusinessName: string;
	carrier: string | null;
	screeningNumber: string | null;
	provisioningStatus: ProtectedLineRecord["provisioningStatus"];
	coverageStatus: ProtectedLineRecord["coverageStatus"];
	isInitialTarget: boolean;
}

export interface AdministrativeReviewLocation {
	id: number;
	createdAt: string;
	protectedLines: AdministrativeReviewLine[];
}

export interface AdministrativeAccountFamily {
	account: UserRecord;
	initialProtectedLineId: number | null;
	protectedLineCount: number;
	locations: AdministrativeReviewLocation[];
}

interface ReviewSessionRow {
	id: string;
	reviewer_user_id: number;
	reviewer_role: string;
	account_user_id: number;
	initial_protected_line_id: number | null;
	started_at: string;
	ended_at: string | null;
}

interface ReviewIdentifier {
	type?: unknown;
	value?: unknown;
}

interface ReviewCommand {
	action?: unknown;
	identifier?: ReviewIdentifier;
	reviewSessionId?: unknown;
	section?: unknown;
	protectedLineId?: unknown;
	field?: unknown;
	value?: unknown;
}

export class AdministrativeReviewError extends Error {
	constructor(
		message: string,
		readonly code: string,
		readonly status: number
	) {
		super(message);
		this.name = "AdministrativeReviewError";
	}
}

export function isAdministrativeReviewer(user: UserRecord): boolean {
	return ADMINISTRATIVE_REVIEW_ROLES.has(user.role);
}

function positiveInteger(value: unknown, fieldName: string): number {
	const normalized = typeof value === "string"
		? value.trim()
		: value;
	const parsed = typeof normalized === "number"
		? normalized
		: typeof normalized === "string" && /^[1-9]\d*$/.test(normalized)
			? Number(normalized)
			: Number.NaN;

	if (!Number.isSafeInteger(parsed) || parsed <= 0) {
		throw new AdministrativeReviewError(
			`${fieldName} must be a positive integer`,
			"invalid_review_identifier",
			400
		);
	}

	return parsed;
}

function requiredString(value: unknown, fieldName: string): string {
	if (typeof value !== "string" || !value.trim()) {
		throw new AdministrativeReviewError(
			`${fieldName} is required`,
			"invalid_review_request",
			400
		);
	}

	return value.trim();
}

function mapReviewSession(
	row: ReviewSessionRow
): AdministrativeReviewSessionRecord {
	let durationSeconds: number | null = null;

	if (row.ended_at) {
		const startedAt = Date.parse(row.started_at);
		const endedAt = Date.parse(row.ended_at);
		if (Number.isFinite(startedAt) && Number.isFinite(endedAt)) {
			durationSeconds = Math.max(
				0,
				Math.floor((endedAt - startedAt) / 1000)
			);
		}
	}

	return {
		id: row.id,
		reviewerUserId: row.reviewer_user_id,
		reviewerRole: row.reviewer_role,
		accountUserId: row.account_user_id,
		initialProtectedLineId: row.initial_protected_line_id,
		startedAt: row.started_at,
		endedAt: row.ended_at,
		durationSeconds
	};
}

async function findReviewSession(
	db: D1Database,
	reviewSessionId: string
): Promise<AdministrativeReviewSessionRecord | null> {
	const row = await db
		.prepare(`
			SELECT
				id,
				reviewer_user_id,
				reviewer_role,
				account_user_id,
				initial_protected_line_id,
				started_at,
				ended_at
			FROM administrative_review_sessions
			WHERE id = ?
		`)
		.bind(reviewSessionId)
		.first<ReviewSessionRow>();

	return row ? mapReviewSession(row) : null;
}

async function requireOwnedReviewSession(
	db: D1Database,
	reviewSessionId: string,
	reviewer: UserRecord,
	requireOpen = true
): Promise<AdministrativeReviewSessionRecord> {
	const session = await findReviewSession(db, reviewSessionId);

	if (!session || session.reviewerUserId !== reviewer.id) {
		throw new AdministrativeReviewError(
			"Administrative review session not found",
			"review_session_not_found",
			404
		);
	}

	if (requireOpen && session.endedAt) {
		throw new AdministrativeReviewError(
			"Administrative review session has ended",
			"review_session_ended",
			409
		);
	}

	return session;
}

async function findLineIdByScreeningNumber(
	db: D1Database,
	screeningNumber: string
): Promise<number | null> {
	const row = await db
		.prepare(`
			SELECT id
			FROM protected_lines
			WHERE screening_number = ?
		`)
		.bind(screeningNumber)
		.first<{ id: number }>();

	return row?.id ?? null;
}

async function resolveReviewIdentifier(
	db: D1Database,
	identifier: ReviewIdentifier | undefined
): Promise<{
		account: UserRecord;
		initialProtectedLineId: number | null;
	}> {
	const type = requiredString(identifier?.type, "identifier.type");
	let accountUserId: number | null = null;
	let initialProtectedLine: ProtectedLineRecord | null = null;

	switch (type) {
		case "account_id":
			accountUserId = positiveInteger(
				identifier?.value,
				"identifier.value"
			);
			break;

		case "email": {
			const email = requiredString(
				identifier?.value,
				"identifier.value"
			).toLowerCase();
			const row = await db
				.prepare("SELECT id FROM users WHERE email = ?")
				.bind(email)
				.first<{ id: number }>();
			accountUserId = row?.id ?? null;
			break;
		}

		case "protected_line_id":
			initialProtectedLine = await findProtectedLineById(
				db,
				positiveInteger(identifier?.value, "identifier.value")
			);
			break;

		case "protected_phone_number":
			initialProtectedLine = await findProtectedLineByPhoneNumber(
				db,
				requiredString(identifier?.value, "identifier.value")
			);
			break;

		case "screening_number": {
			const lineId = await findLineIdByScreeningNumber(
				db,
				requiredString(identifier?.value, "identifier.value")
			);
			initialProtectedLine = lineId
				? await findProtectedLineById(db, lineId)
				: null;
			break;
		}

		default:
			throw new AdministrativeReviewError(
				"Unsupported administrative review identifier",
				"unsupported_review_identifier",
				400
			);
	}

	if (initialProtectedLine) {
		accountUserId = initialProtectedLine.userId;
	}

	if (!accountUserId) {
		throw new AdministrativeReviewError(
			"Customer account or Protected Line was not found",
			"review_target_not_found",
			404
		);
	}

	const account = await findUserByIdIncludingInactive(db, accountUserId);

	if (!account) {
		throw new AdministrativeReviewError(
			"Customer account was not found",
			"review_target_not_found",
			404
		);
	}

	return {
		account,
		initialProtectedLineId: initialProtectedLine?.id ?? null
	};
}

async function buildAccountFamily(
	db: D1Database,
	accountUserId: number,
	initialProtectedLineId: number | null
): Promise<AdministrativeAccountFamily> {
	const account = await findUserByIdIncludingInactive(db, accountUserId);

	if (!account) {
		throw new AdministrativeReviewError(
			"Customer account was not found",
			"review_target_not_found",
			404
		);
	}

	const [locations, protectedLines] = await Promise.all([
		listAccountLocations(db, accountUserId),
		listProtectedLinesForAccount(db, accountUserId)
	]);

	if (
		initialProtectedLineId !== null
		&& !protectedLines.some((line) => line.id === initialProtectedLineId)
	) {
		throw new AdministrativeReviewError(
			"Initial Protected Line does not belong to the reviewed account",
			"review_target_mismatch",
			409
		);
	}

	const reviewLine = (
		line: ProtectedLineRecord
	): AdministrativeReviewLine => ({
		id: line.id,
		locationId: line.locationId,
		protectedPhoneNumber: line.protectedPhoneNumber,
		callerFacingBusinessName: line.callerFacingBusinessName,
		carrier: line.carrier,
		screeningNumber: line.screeningNumber,
		provisioningStatus: line.provisioningStatus,
		coverageStatus: line.coverageStatus,
		isInitialTarget: line.id === initialProtectedLineId
	});

	return {
		account,
		initialProtectedLineId,
		protectedLineCount: protectedLines.length,
		locations: locations.map((location) => ({
			id: location.id,
			createdAt: location.createdAt,
			protectedLines: protectedLines
				.filter((line) => line.locationId === location.id)
				.map(reviewLine)
		}))
	};
}

function reviewEventStatement(
	db: D1Database,
	input: {
		reviewSessionId: string;
		reviewerUserId: number;
		accountUserId: number;
		protectedLineId: number | null;
		eventType: "read" | "write";
		resourceSection: string;
		action: string;
		fieldName?: string | null;
		priorValue?: string | null;
		resultingValue?: string | null;
		createdAt: string;
	}
): D1PreparedStatement {
	return db
		.prepare(`
			INSERT INTO administrative_review_events (
				review_session_id,
				reviewer_user_id,
				account_user_id,
				protected_line_id,
				event_type,
				resource_section,
				action,
				field_name,
				prior_value,
				resulting_value,
				created_at
			)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`)
		.bind(
			input.reviewSessionId,
			input.reviewerUserId,
			input.accountUserId,
			input.protectedLineId,
			input.eventType,
			input.resourceSection,
			input.action,
			input.fieldName ?? null,
			input.priorValue ?? null,
			input.resultingValue ?? null,
			input.createdAt
		);
}

async function startAdministrativeReview(
	db: D1Database,
	reviewer: UserRecord,
	identifier: ReviewIdentifier | undefined,
	now: () => string,
	createSessionId: () => string
) {
	const resolved = await resolveReviewIdentifier(db, identifier);
	const family = await buildAccountFamily(
		db,
		resolved.account.id,
		resolved.initialProtectedLineId
	);
	const reviewSessionId = createSessionId();
	const startedAt = now();
	const lines = family.locations.flatMap((location) =>
		location.protectedLines
	);
	const statements = [
		db.prepare(`
			INSERT INTO administrative_review_sessions (
				id,
				reviewer_user_id,
				reviewer_role,
				account_user_id,
				initial_protected_line_id,
				started_at
			)
			VALUES (?, ?, ?, ?, ?, ?)
		`).bind(
			reviewSessionId,
			reviewer.id,
			reviewer.role,
			family.account.id,
			family.initialProtectedLineId,
			startedAt
		),
		reviewEventStatement(db, {
			reviewSessionId,
			reviewerUserId: reviewer.id,
			accountUserId: family.account.id,
			protectedLineId: family.initialProtectedLineId,
			eventType: "read",
			resourceSection: "account_family",
			action: "review_started",
			createdAt: startedAt
		}),
		...lines.map((line) => reviewEventStatement(db, {
			reviewSessionId,
			reviewerUserId: reviewer.id,
			accountUserId: family.account.id,
			protectedLineId: line.id,
			eventType: "read",
			resourceSection: "protected_line_summary",
			action: "visible_in_account_family",
			createdAt: startedAt
		}))
	];

	await db.batch(statements);

	const reviewSession = await findReviewSession(db, reviewSessionId);
	if (!reviewSession) {
		throw new Error("Failed to create administrative review session");
	}

	return { reviewSession, family };
}

async function viewAdministrativeReviewSection(
	db: D1Database,
	reviewer: UserRecord,
	command: ReviewCommand,
	now: () => string
) {
	const reviewSessionId = requiredString(
		command.reviewSessionId,
		"reviewSessionId"
	);
	const session = await requireOwnedReviewSession(
		db,
		reviewSessionId,
		reviewer
	);
	const section = requiredString(command.section, "section");

	if (!REVIEW_SECTIONS.has(section)) {
		throw new AdministrativeReviewError(
			"Unsupported administrative review section",
			"unsupported_review_section",
			400
		);
	}

	const family = await buildAccountFamily(
		db,
		session.accountUserId,
		session.initialProtectedLineId
	);
	let protectedLineId: number | null = null;

	if (section === "protected_line") {
		protectedLineId = positiveInteger(
			command.protectedLineId,
			"protectedLineId"
		);
		const belongsToFamily = family.locations.some((location) =>
			location.protectedLines.some((line) => line.id === protectedLineId)
		);

		if (!belongsToFamily) {
			throw new AdministrativeReviewError(
				"Protected Line does not belong to the reviewed account",
				"review_target_mismatch",
				409
			);
		}
	}

	await reviewEventStatement(db, {
		reviewSessionId,
		reviewerUserId: reviewer.id,
		accountUserId: session.accountUserId,
		protectedLineId,
		eventType: "read",
		resourceSection: section,
		action: "section_viewed",
		createdAt: now()
	}).run();

	return {
		reviewSession: session,
		examinedSection: section,
		examinedProtectedLineId: protectedLineId,
		family
	};
}

async function updateAdministrativeReviewLine(
	db: D1Database,
	reviewer: UserRecord,
	command: ReviewCommand,
	now: () => string
) {
	const reviewSessionId = requiredString(
		command.reviewSessionId,
		"reviewSessionId"
	);
	const session = await requireOwnedReviewSession(
		db,
		reviewSessionId,
		reviewer
	);
	const protectedLineId = positiveInteger(
		command.protectedLineId,
		"protectedLineId"
	);
	const field = requiredString(command.field, "field");

	if (SENSITIVE_FIELD_PATTERN.test(field)) {
		throw new AdministrativeReviewError(
			"Sensitive fields are not writable through administrative review",
			"sensitive_review_field_rejected",
			400
		);
	}

	const fieldDefinition = {
		carrier: {
			column: "carrier",
			allowNull: true
		},
		callerFacingBusinessName: {
			column: "caller_facing_business_name",
			allowNull: false
		}
	}[field as "carrier" | "callerFacingBusinessName"];

	if (!fieldDefinition) {
		throw new AdministrativeReviewError(
			"Field is not writable through administrative review",
			"review_field_not_writable",
			400
		);
	}

	const line = await findProtectedLineById(db, protectedLineId);
	if (!line || line.userId !== session.accountUserId) {
		throw new AdministrativeReviewError(
			"Protected Line does not belong to the reviewed account",
			"review_target_mismatch",
			409
		);
	}

	let resultingValue: string | null;
	if (command.value === null && fieldDefinition.allowNull) {
		resultingValue = null;
	} else if (typeof command.value === "string") {
		resultingValue = command.value.trim();
		if (!resultingValue) {
			resultingValue = fieldDefinition.allowNull ? null : "";
		}
	} else {
		throw new AdministrativeReviewError(
			"Review field value must be a string or allowed null",
			"invalid_review_field_value",
			400
		);
	}

	if (!fieldDefinition.allowNull && !resultingValue) {
		throw new AdministrativeReviewError(
			"Caller-facing spoken identity cannot be empty",
			"invalid_review_field_value",
			400
		);
	}

	const priorValue = field === "carrier"
		? line.carrier
		: line.callerFacingBusinessName;
	const changedAt = now();
	const results = await db.batch([
		db.prepare(`
			UPDATE protected_lines
			SET ${fieldDefinition.column} = ?,
				updated_at = ?
			WHERE id = ?
				AND user_id = ?
		`).bind(
			resultingValue,
			changedAt,
			line.id,
			session.accountUserId
		),
		reviewEventStatement(db, {
			reviewSessionId,
			reviewerUserId: reviewer.id,
			accountUserId: session.accountUserId,
			protectedLineId: line.id,
			eventType: "write",
			resourceSection: "protected_line",
			action: "field_updated",
			fieldName: field,
			priorValue,
			resultingValue,
			createdAt: changedAt
		})
	]);

	if (results.some((result) => result.meta.changes !== 1)) {
		throw new Error("Failed to update and audit Protected Line review change");
	}

	return {
		reviewSession: session,
		change: {
			protectedLineId: line.id,
			field,
			priorValue,
			resultingValue,
			changedAt
		},
		family: await buildAccountFamily(
			db,
			session.accountUserId,
			session.initialProtectedLineId
		)
	};
}

async function endAdministrativeReview(
	db: D1Database,
	reviewer: UserRecord,
	command: ReviewCommand,
	now: () => string
) {
	const reviewSessionId = requiredString(
		command.reviewSessionId,
		"reviewSessionId"
	);
	const session = await requireOwnedReviewSession(
		db,
		reviewSessionId,
		reviewer,
		false
	);

	if (!session.endedAt) {
		await db
			.prepare(`
				UPDATE administrative_review_sessions
				SET ended_at = ?
				WHERE id = ?
					AND reviewer_user_id = ?
					AND ended_at IS NULL
			`)
			.bind(now(), reviewSessionId, reviewer.id)
			.run();
	}

	const endedSession = await findReviewSession(db, reviewSessionId);
	if (!endedSession?.endedAt) {
		throw new Error("Failed to end administrative review session");
	}

	return { reviewSession: endedSession };
}

export async function handleAdministrativeReviewGate(
	db: D1Database,
	reviewer: UserRecord,
	command: ReviewCommand,
	options: {
		now?: () => string;
		createSessionId?: () => string;
	} = {}
) {
	if (!isAdministrativeReviewer(reviewer)) {
		throw new AdministrativeReviewError(
			"Administrative review role required",
			"administrative_review_forbidden",
			403
		);
	}

	const now = options.now ?? (() => new Date().toISOString());
	const createSessionId = options.createSessionId
		?? (() => crypto.randomUUID());

	switch (command.action) {
		case "start":
			return startAdministrativeReview(
				db,
				reviewer,
				command.identifier,
				now,
				createSessionId
			);

		case "view":
			return viewAdministrativeReviewSection(
				db,
				reviewer,
				command,
				now
			);

		case "update":
			return updateAdministrativeReviewLine(
				db,
				reviewer,
				command,
				now
			);

		case "end":
			return endAdministrativeReview(
				db,
				reviewer,
				command,
				now
			);

		default:
			throw new AdministrativeReviewError(
				"Administrative review action must be start, view, update, or end",
				"unsupported_review_action",
				400
			);
	}
}
