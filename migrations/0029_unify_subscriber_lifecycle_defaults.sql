-- Subscriber lifecycle state is application-controlled.
--
-- New subscriber creation explicitly writes:
--   role = 'subscriber' (or the enrollment-specific role)
--   setup_status = 'onboarding_incomplete'
--   coverage_status = 'inactive'
--
-- Onboarding completion and provisioning explicitly advance setup_status and
-- coverage_status. Existing rows predate that lifecycle and are intentionally
-- left unchanged because their state cannot be inferred safely from defaults.
-- No users-table rebuild or production-data normalization is required.

SELECT 1 AS subscriber_lifecycle_is_application_controlled;
