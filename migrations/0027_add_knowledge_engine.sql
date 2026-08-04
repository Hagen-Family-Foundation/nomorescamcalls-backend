CREATE TABLE knowledge_engine_search_history (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	search_criteria TEXT NOT NULL,
	sort_field TEXT NOT NULL DEFAULT 'call_started_at',
	sort_direction TEXT NOT NULL DEFAULT 'DESC',
	result_count INTEGER NOT NULL DEFAULT 0,
	executed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE knowledge_engine_recipe_catalog (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	search_history_id INTEGER NOT NULL UNIQUE,
	title TEXT NOT NULL,
	purpose TEXT NOT NULL,
	created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (search_history_id)
		REFERENCES knowledge_engine_search_history(id)
		ON DELETE RESTRICT
);

CREATE INDEX idx_knowledge_engine_search_history_executed_at
ON knowledge_engine_search_history(executed_at);

CREATE INDEX idx_knowledge_engine_recipe_catalog_title
ON knowledge_engine_recipe_catalog(title);
