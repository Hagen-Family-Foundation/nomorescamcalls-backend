ALTER TABLE users
ADD COLUMN caller_facing_business_name TEXT;

ALTER TABLE evidence_library_calls
ADD COLUMN subscriber_caller_facing_business_name TEXT;
