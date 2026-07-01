-- Rebuild allow/block lists so entries are unique per user, not globally per phone number.

CREATE TABLE allow_list_new (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id INTEGER,
	phone_number TEXT NOT NULL,
	reason TEXT NOT NULL,
	created_at TEXT DEFAULT CURRENT_TIMESTAMP,
	UNIQUE(user_id, phone_number)
);

INSERT INTO allow_list_new (
	id,
	user_id,
	phone_number,
	reason,
	created_at
)
SELECT
	id,
	user_id,
	phone_number,
	reason,
	created_at
FROM allow_list;

DROP TABLE allow_list;

ALTER TABLE allow_list_new RENAME TO allow_list;

CREATE INDEX idx_allow_list_user_id ON allow_list(user_id);


CREATE TABLE block_list_new (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id INTEGER,
	phone_number TEXT NOT NULL,
	reason TEXT NOT NULL,
	created_at TEXT DEFAULT CURRENT_TIMESTAMP,
	UNIQUE(user_id, phone_number)
);

INSERT INTO block_list_new (
	id,
	user_id,
	phone_number,
	reason,
	created_at
)
SELECT
	id,
	user_id,
	phone_number,
	reason,
	created_at
FROM block_list;

DROP TABLE block_list;

ALTER TABLE block_list_new RENAME TO block_list;

CREATE INDEX idx_block_list_user_id ON block_list(user_id);
