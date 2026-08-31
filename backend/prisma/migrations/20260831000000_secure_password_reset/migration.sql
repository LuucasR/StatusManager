-- Removes the plaintext password-reset flow.
--
-- "requestedPassword" held the password the employee WANTED, unhashed. It was
-- readable in the database, in every backup, and was returned by
-- GET /admin/password-change-requests straight onto the admin's screen. Dropping
-- the column destroys that cleartext; this is irreversible and intended.
--
-- Pending rows are rejected first: they belong to a flow that no longer exists,
-- and leaving them PENDING would let an admin approve a request whose password
-- is already gone.
UPDATE "PasswordChangeRequest"
SET "status" = 'REJECTED', "resolvedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'PENDING';

ALTER TABLE "PasswordChangeRequest" DROP COLUMN "requestedPassword";

-- Set when an admin resolves a reset request. The replacement flow mints a
-- random temporary password, stores only its hash and shows the cleartext to
-- the admin once, so the employee must pick a real one on next login.
ALTER TABLE "Employee"
ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

-- Tokens issued before this instant are rejected. Without it, changing a
-- password left every already-issued JWT valid for up to a day.
ALTER TABLE "Employee" ADD COLUMN "passwordChangedAt" TIMESTAMP(3);
