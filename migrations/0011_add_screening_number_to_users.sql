ALTER TABLE users ADD COLUMN screening_number TEXT;

CREATE UNIQUE INDEX idx_users_screening_number
ON users(screening_number);
