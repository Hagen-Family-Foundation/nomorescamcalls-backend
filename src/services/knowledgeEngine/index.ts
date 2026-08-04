export type KnowledgeEngineSearchValue =
	| string
	| number
	| boolean
	| null
	| Array<string | number>;

export interface KnowledgeEngineSearchCriteria {
	[field: string]: KnowledgeEngineSearchValue;
}

export interface KnowledgeEngineSearchRequest {
	criteria: KnowledgeEngineSearchCriteria;
	sortField?: string;
	sortDirection?: "ASC" | "DESC";
	limit?: number;
	offset?: number;
}

export interface KnowledgeEngineSearchResult {
	searchHistoryId: number;
	criteria: KnowledgeEngineSearchCriteria;
	sortField: string;
	sortDirection: "ASC" | "DESC";
	resultCount: number;
	records: Record<string, unknown>[];
	executedAt: string;
}

export interface KnowledgeEngineRecipe {
	id: number;
	searchHistoryId: number;
	title: string;
	purpose: string;
	searchCriteria: KnowledgeEngineSearchCriteria;
	sortField: string;
	sortDirection: "ASC" | "DESC";
	createdAt: string;
}

const SEARCHABLE_FIELDS = new Set([
	"id",
	"call_session_id",
	"call_control_id",
	"call_started_at",
	"call_completed_at",
	"created_at",
	"updated_at",
	"final_standing",
	"final_disposition",
	"evidence_box",

	"caller_calling_number",
	"caller_cnam",
	"caller_carrier",
	"caller_line_type",
	"caller_stir_shaken",
	"caller_ipqs",
	"caller_name",
	"caller_name_accepted",

	"caller_block_2_findings",
	"caller_block_2_deductions",
	"caller_prompt_1_recording",
	"caller_prompt_1_transcript",
	"caller_prompt_1_evaluation",
	"caller_prompt_2_recording",
	"caller_prompt_2_transcript",
	"caller_prompt_2_evaluation",
	"caller_reason_for_calling",
	"caller_reason_accepted",
	"caller_response_deductions",
	"caller_recovered_deductions",
	"caller_ipqs_deductions",
	"complete_call_recording",
	"call_duration_seconds",
	"billable_minutes",
	"call_cost",

	"caller_country",
	"caller_state",
	"caller_county",
	"caller_city",
	"caller_zip_code",
	"caller_area_code",
	"caller_geographic_information",

	"call_date",
	"call_start_time",
	"call_day_of_week",
	"call_week_of_month",
	"call_month",
	"call_year",
	"prompt_1_at",
	"prompt_2_at",
	"connection_at",
	"diversion_at",
	"recording_available_at",

	"caller_stated_reason",
	"caller_accepted_reason",
	"caller_unaccepted_reason",
	"caller_supporting_evidence",
	"caller_deductions",

	"subscriber_id",
	"subscriber_name",
	"subscriber_phone_number",
	"subscriber_screening_number",
	"subscriber_sip_username",
	"subscriber_carrier",
	"subscriber_account_status",
	"subscriber_coverage_status",

	"subscriber_connected",
	"subscriber_diverted",

	"subscriber_country",
	"subscriber_state",
	"subscriber_county",
	"subscriber_city",
	"subscriber_zip_code",
	"subscriber_community",

	"subscriber_supporting_evidence",
	"telnyx_final_record"
]);

function assertSearchableField(field: string): void {
	if (!SEARCHABLE_FIELDS.has(field)) {
		throw new Error(
			`Evidence Library field is not searchable: ${field}`
		);
	}
}

function normalizeSearchValue(
	value: string | number | boolean
): string | number {
	if (typeof value === "boolean") {
		return value ? 1 : 0;
	}

	return value;
}

function buildWhereClause(
	criteria: KnowledgeEngineSearchCriteria
): {
	sql: string;
	bindings: Array<string | number>;
} {
	const clauses: string[] = [];
	const bindings: Array<string | number> = [];

	for (const [field, value] of Object.entries(criteria)) {
		assertSearchableField(field);

		if (value === null) {
			clauses.push(`${field} IS NULL`);
			continue;
		}

		if (Array.isArray(value)) {
			if (value.length === 0) {
				clauses.push("1 = 0");
				continue;
			}

			const placeholders =
				value.map(() => "?").join(", ");

			clauses.push(
				`${field} IN (${placeholders})`
			);

			for (const item of value) {
				bindings.push(
					normalizeSearchValue(item)
				);
			}

			continue;
		}

		clauses.push(`${field} = ?`);
		bindings.push(
			normalizeSearchValue(value)
		);
	}

	return {
		sql:
			clauses.length > 0
				? `WHERE ${clauses.join(" AND ")}`
				: "",
		bindings
	};
}

function safeLimit(limit?: number): number {
	if (
		limit === undefined ||
		!Number.isFinite(limit)
	) {
		return 100;
	}

	return Math.max(
		1,
		Math.min(Math.trunc(limit), 1000)
	);
}

function safeOffset(offset?: number): number {
	if (
		offset === undefined ||
		!Number.isFinite(offset)
	) {
		return 0;
	}

	return Math.max(0, Math.trunc(offset));
}

function parseCriteria(
	value: string
): KnowledgeEngineSearchCriteria {
	const parsed = JSON.parse(value) as unknown;

	if (
		!parsed ||
		typeof parsed !== "object" ||
		Array.isArray(parsed)
	) {
		throw new Error(
			"Stored Knowledge Engine search criteria is invalid."
		);
	}

	return parsed as KnowledgeEngineSearchCriteria;
}

export async function searchEvidenceLibrary(
	db: D1Database,
	request: KnowledgeEngineSearchRequest,
	now: () => string = () =>
		new Date().toISOString()
): Promise<KnowledgeEngineSearchResult> {
	const sortField =
		request.sortField ?? "call_started_at";

	assertSearchableField(sortField);

	const sortDirection =
		request.sortDirection ?? "DESC";

	const limit = safeLimit(request.limit);
	const offset = safeOffset(request.offset);

	const where =
		buildWhereClause(request.criteria);

	const countResult = await db
		.prepare(`
			SELECT COUNT(*) AS total
			FROM evidence_library_calls
			${where.sql}
		`)
		.bind(...where.bindings)
		.first<{
			total: number;
		}>();

	const resultCount =
		Number(countResult?.total ?? 0);

	const recordsResult = await db
		.prepare(`
			SELECT *
			FROM evidence_library_calls
			${where.sql}
			ORDER BY ${sortField} ${sortDirection}
			LIMIT ?
			OFFSET ?
		`)
		.bind(
			...where.bindings,
			limit,
			offset
		)
		.all<Record<string, unknown>>();

	const executedAt = now();

	const historyInsert = await db
		.prepare(`
			INSERT INTO knowledge_engine_search_history (
				search_criteria,
				sort_field,
				sort_direction,
				result_count,
				executed_at
			)
			VALUES (?, ?, ?, ?, ?)
		`)
		.bind(
			JSON.stringify(request.criteria),
			sortField,
			sortDirection,
			resultCount,
			executedAt
		)
		.run();

	return {
		searchHistoryId:
			Number(historyInsert.meta.last_row_id),
		criteria: request.criteria,
		sortField,
		sortDirection,
		resultCount,
		records: recordsResult.results,
		executedAt
	};
}

export async function listSearchHistory(
	db: D1Database,
	limit = 100
): Promise<Array<{
	id: number;
	searchCriteria:
		KnowledgeEngineSearchCriteria;
	sortField: string;
	sortDirection: "ASC" | "DESC";
	resultCount: number;
	executedAt: string;
}>> {
	const result = await db
		.prepare(`
			SELECT
				id,
				search_criteria,
				sort_field,
				sort_direction,
				result_count,
				executed_at
			FROM knowledge_engine_search_history
			ORDER BY id DESC
			LIMIT ?
		`)
		.bind(safeLimit(limit))
		.all<{
			id: number;
			search_criteria: string;
			sort_field: string;
			sort_direction: "ASC" | "DESC";
			result_count: number;
			executed_at: string;
		}>();

	return result.results.map((row) => ({
		id: row.id,
		searchCriteria:
			parseCriteria(row.search_criteria),
		sortField: row.sort_field,
		sortDirection:
			row.sort_direction,
		resultCount: row.result_count,
		executedAt: row.executed_at
	}));
}

export async function addSearchToRecipeCatalog(
	db: D1Database,
	input: {
		searchHistoryId: number;
		title: string;
		purpose: string;
	},
	now: () => string = () =>
		new Date().toISOString()
): Promise<KnowledgeEngineRecipe> {
	const title = input.title.trim();
	const purpose = input.purpose.trim();

	if (!title) {
		throw new Error(
			"Recipe title is required."
		);
	}

	if (!purpose) {
		throw new Error(
			"Recipe purpose is required."
		);
	}

	const search = await db
		.prepare(`
			SELECT
				id,
				search_criteria,
				sort_field,
				sort_direction
			FROM knowledge_engine_search_history
			WHERE id = ?
		`)
		.bind(input.searchHistoryId)
		.first<{
			id: number;
			search_criteria: string;
			sort_field: string;
			sort_direction: "ASC" | "DESC";
		}>();

	if (!search) {
		throw new Error(
			"Search history record was not found."
		);
	}

	const createdAt = now();

	const insert = await db
		.prepare(`
			INSERT INTO knowledge_engine_recipe_catalog (
				search_history_id,
				title,
				purpose,
				created_at
			)
			VALUES (?, ?, ?, ?)
		`)
		.bind(
			search.id,
			title,
			purpose,
			createdAt
		)
		.run();

	return {
		id: Number(insert.meta.last_row_id),
		searchHistoryId: search.id,
		title,
		purpose,
		searchCriteria:
			parseCriteria(
				search.search_criteria
			),
		sortField: search.sort_field,
		sortDirection:
			search.sort_direction,
		createdAt
	};
}

export async function listRecipeCatalog(
	db: D1Database,
	limit = 100
): Promise<KnowledgeEngineRecipe[]> {
	const result = await db
		.prepare(`
			SELECT
				recipe.id,
				recipe.search_history_id,
				recipe.title,
				recipe.purpose,
				recipe.created_at,
				history.search_criteria,
				history.sort_field,
				history.sort_direction
			FROM knowledge_engine_recipe_catalog
				AS recipe
			INNER JOIN
				knowledge_engine_search_history
				AS history
				ON history.id =
					recipe.search_history_id
			ORDER BY recipe.id DESC
			LIMIT ?
		`)
		.bind(safeLimit(limit))
		.all<{
			id: number;
			search_history_id: number;
			title: string;
			purpose: string;
			created_at: string;
			search_criteria: string;
			sort_field: string;
			sort_direction: "ASC" | "DESC";
		}>();

	return result.results.map((row) => ({
		id: row.id,
		searchHistoryId:
			row.search_history_id,
		title: row.title,
		purpose: row.purpose,
		searchCriteria:
			parseCriteria(
				row.search_criteria
			),
		sortField: row.sort_field,
		sortDirection:
			row.sort_direction,
		createdAt: row.created_at
	}));
}

export async function runRecipe(
	db: D1Database,
	recipeId: number,
	input: {
		limit?: number;
		offset?: number;
	} = {},
	now: () => string = () =>
		new Date().toISOString()
): Promise<KnowledgeEngineSearchResult> {
	const recipe = await db
		.prepare(`
			SELECT
				history.search_criteria,
				history.sort_field,
				history.sort_direction
			FROM knowledge_engine_recipe_catalog
				AS recipe
			INNER JOIN
				knowledge_engine_search_history
				AS history
				ON history.id =
					recipe.search_history_id
			WHERE recipe.id = ?
		`)
		.bind(recipeId)
		.first<{
			search_criteria: string;
			sort_field: string;
			sort_direction: "ASC" | "DESC";
		}>();

	if (!recipe) {
		throw new Error(
			"Recipe Catalog record was not found."
		);
	}

	return searchEvidenceLibrary(
		db,
		{
			criteria:
				parseCriteria(
					recipe.search_criteria
				),
			sortField:
				recipe.sort_field,
			sortDirection:
				recipe.sort_direction,
			limit: input.limit,
			offset: input.offset
		},
		now
	);
}
