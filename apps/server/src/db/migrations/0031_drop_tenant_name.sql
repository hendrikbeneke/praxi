-- `tenant.name` is gone. It was written by the seed and by the test fixtures
-- and read by nothing: what the practice is called lives in
-- `practice_settings.practice_name`, which is what the sidebar, the account
-- menu and the settings form all read. A second column holding the practice
-- name would eventually hold a different one.
--
-- The tenant row is identity only now — an id and its timestamps.

ALTER TABLE "tenant" DROP COLUMN "name";
