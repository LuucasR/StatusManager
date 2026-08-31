-- Backfills the Spanish text that was already persisted before the English
-- migration.
--
-- Notification.title/body are deliberate SNAPSHOTS: they are rendered once, at
-- write time, so the history survives the task being deleted. That means
-- translating the generators only affects NEW rows; everything already in the
-- table stays Spanish forever unless it is rewritten here.
--
-- Anchored replacements (^ and $) rather than plain replace(): the task title is
-- user data and is interpolated into the middle of these strings, so an
-- unanchored match could corrupt a title that happens to contain the phrase.

-- "Te agregaron a la tarea <title>"
UPDATE "Notification"
SET "body" = regexp_replace("body", '^Te agregaron a la tarea ', 'You were added to task ')
WHERE "body" LIKE 'Te agregaron a la tarea %';

-- "Te sacaron de la tarea <title>"
UPDATE "Notification"
SET "body" = regexp_replace("body", '^Te sacaron de la tarea ', 'You were removed from task ')
WHERE "body" LIKE 'Te sacaron de la tarea %';

-- "<title> pasó a <state>" - the state label is the suffix, so anchor on the end.
UPDATE "Notification"
SET "body" = regexp_replace("body", ' pasó a Pendiente$', ' moved to Pending')
WHERE "body" LIKE '% pasó a Pendiente';

UPDATE "Notification"
SET "body" = regexp_replace("body", ' pasó a En curso$', ' moved to In progress')
WHERE "body" LIKE '% pasó a En curso';

UPDATE "Notification"
SET "body" = regexp_replace("body", ' pasó a Terminada$', ' moved to Done')
WHERE "body" LIKE '% pasó a Terminada';

-- Fallback title used by notifyNewMessage when the conversation had no snapshot.
-- Scoped to TASK_MESSAGE because Notification.title is otherwise the task's own
-- title, which is user data. A task literally named "Tarea" would be caught by
-- this too; that is the accepted trade for fixing the fallback rows.
UPDATE "Notification"
SET "title" = 'Task'
WHERE "type" = 'TASK_MESSAGE' AND "title" = 'Tarea';

-- Seeded administrator. seed.ts only sets `name` on create, so re-running the
-- seed would never fix an existing row.
UPDATE "Employee" SET "name" = 'Administrator' WHERE "name" = 'Administrador';

-- Conversation.title = 'General' is identical in both languages: left alone.
