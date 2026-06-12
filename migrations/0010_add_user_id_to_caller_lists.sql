ALTER TABLE allow_list ADD COLUMN user_id INTEGER;
ALTER TABLE block_list ADD COLUMN user_id INTEGER;

CREATE INDEX idx_allow_list_user_id ON allow_list(user_id);
CREATE INDEX idx_block_list_user_id ON block_list(user_id);
