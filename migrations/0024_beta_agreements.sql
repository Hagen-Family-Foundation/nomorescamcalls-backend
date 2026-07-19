CREATE TABLE beta_agreements (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	version TEXT NOT NULL UNIQUE,
	title TEXT NOT NULL,
	content_hash TEXT NOT NULL,
	effective_at TEXT NOT NULL,
	active INTEGER NOT NULL DEFAULT 1,
	created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_beta_agreements_one_active
	ON beta_agreements(active)
	WHERE active = 1;
