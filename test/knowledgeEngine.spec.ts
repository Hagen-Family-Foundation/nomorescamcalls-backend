import {
	beforeAll,
	describe,
	expect,
	it
} from "vitest";
import {
	env
} from "cloudflare:test";
import {
	addSearchToRecipeCatalog,
	listRecipeCatalog,
	listSearchHistory,
	runRecipe,
	searchEvidenceLibrary
} from "../src/services/knowledgeEngine";

async function ensureKnowledgeEngineSchema():
	Promise<void> {
	await env.nomorescamcalls_db
		.prepare(`
			CREATE TABLE IF NOT EXISTS evidence_library_calls (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				call_session_id TEXT NOT NULL UNIQUE,
				call_control_id TEXT NOT NULL,
				call_started_at TEXT NOT NULL,
				final_standing INTEGER,
				final_disposition TEXT,
				evidence_box TEXT NOT NULL,
				caller_state TEXT,
				call_day_of_week TEXT,
				call_start_time TEXT,
				subscriber_state TEXT,
				call_duration_seconds INTEGER,
				billable_minutes REAL,
				call_cost REAL
			)
		`)
		.run();

	await env.nomorescamcalls_db
		.prepare(`
			CREATE TABLE IF NOT EXISTS knowledge_engine_search_history (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				search_criteria TEXT NOT NULL,
				sort_field TEXT NOT NULL DEFAULT 'call_started_at',
				sort_direction TEXT NOT NULL DEFAULT 'DESC',
				result_count INTEGER NOT NULL DEFAULT 0,
				executed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
		`)
		.run();

	await env.nomorescamcalls_db
		.prepare(`
			CREATE TABLE IF NOT EXISTS knowledge_engine_recipe_catalog (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				search_history_id INTEGER NOT NULL UNIQUE,
				title TEXT NOT NULL,
				purpose TEXT NOT NULL,
				created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
		`)
		.run();

	await env.nomorescamcalls_db
		.prepare(`
			INSERT OR REPLACE INTO evidence_library_calls (
				call_session_id,
				call_control_id,
				call_started_at,
				final_standing,
				final_disposition,
				evidence_box,
				caller_state,
				call_day_of_week,
				call_start_time,
				subscriber_state,
				call_duration_seconds,
				billable_minutes,
				call_cost
			)
			VALUES
				(
					'knowledge-session-1',
					'knowledge-control-1',
					'2026-08-03T14:30:00.000Z',
					70,
					'diverted',
					'{}',
					'Florida',
					'Monday',
					'14:30:00',
					'Missouri',
					45,
					1,
					0.015
				),
				(
					'knowledge-session-2',
					'knowledge-control-2',
					'2026-08-05T16:00:00.000Z',
					72,
					'diverted',
					'{}',
					'Florida',
					'Wednesday',
					'16:00:00',
					'Missouri',
					55,
					1,
					0.015
				),
				(
					'knowledge-session-3',
					'knowledge-control-3',
					'2026-08-06T20:00:00.000Z',
					100,
					'connected',
					'{}',
					'Texas',
					'Thursday',
					'20:00:00',
					'Kansas',
					900,
					15,
					0.225
				)
		`)
		.run();
}

async function createSearch() {
	return searchEvidenceLibrary(
		env.nomorescamcalls_db,
		{
			criteria: {
				caller_state: "Florida",
				call_day_of_week: [
					"Monday",
					"Wednesday",
					"Friday"
				],
				final_disposition: "diverted"
			},
			sortField: "call_started_at",
			sortDirection: "ASC"
		},
		() =>
			"2026-08-07T12:00:00.000Z"
	);
}

async function createRecipe() {
	const search = await createSearch();

	return addSearchToRecipeCatalog(
		env.nomorescamcalls_db,
		{
			searchHistoryId:
				search.searchHistoryId,
			title:
				"Florida Weekday Diverted Calls",
			purpose:
				"Find diverted Florida calls on selected weekdays."
		},
		() =>
			"2026-08-07T12:05:00.000Z"
	);
}

describe("Knowledge Engine", () => {
	beforeAll(async () => {
		await ensureKnowledgeEngineSchema();
	});

	it("searches approved Evidence Library fields together", async () => {
		const result = await createSearch();

		expect(result.resultCount).toBe(2);

		expect(
			result.records.map(
				(record) =>
					record.call_session_id
			)
		).toEqual([
			"knowledge-session-1",
			"knowledge-session-2"
		]);

		expect(
			result.searchHistoryId
		).toBeGreaterThan(0);
	});

	it("keeps every executed search in Search History", async () => {
		await createSearch();

		const history =
			await listSearchHistory(
				env.nomorescamcalls_db
			);

		expect(history.length).toBeGreaterThan(0);

		expect(
			history[0].searchCriteria
		).toEqual({
			caller_state: "Florida",
			call_day_of_week: [
				"Monday",
				"Wednesday",
				"Friday"
			],
			final_disposition: "diverted"
		});

		expect(history[0].resultCount).toBe(2);
	});

	it("adds a search to the Recipe Catalog only after the admin chooses it", async () => {
		const recipe = await createRecipe();

		expect(recipe.title).toBe(
			"Florida Weekday Diverted Calls"
		);

		const catalog =
			await listRecipeCatalog(
				env.nomorescamcalls_db
			);

		expect(catalog).toHaveLength(1);

		expect(
			catalog[0].searchCriteria
		).toEqual({
			caller_state: "Florida",
			call_day_of_week: [
				"Monday",
				"Wednesday",
				"Friday"
			],
			final_disposition: "diverted"
		});
	});

	it("reruns a saved recipe against the current Evidence Library", async () => {
		const recipe = await createRecipe();

		const result =
			await runRecipe(
				env.nomorescamcalls_db,
				recipe.id,
				{},
				() =>
					"2026-08-07T12:10:00.000Z"
			);

		expect(result.resultCount).toBe(2);

		expect(
			result.records.map(
				(record) =>
					record.call_session_id
			)
		).toEqual([
			"knowledge-session-1",
			"knowledge-session-2"
		]);
	});
});
