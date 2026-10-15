-- Deactivated accounts now leave their tasks when they are deactivated. This
-- does the same for the ones deactivated before that: out of the items they
-- were in charge of, the tasks themselves and the tasks' chats.

DELETE FROM "TaskChecklistAssignee"
WHERE "employeeId" IN (SELECT "id" FROM "Employee" WHERE "active" = false AND "deactivatedAt" IS NOT NULL);

DELETE FROM "ConversationMember"
WHERE "employeeId" IN (SELECT "id" FROM "Employee" WHERE "active" = false AND "deactivatedAt" IS NOT NULL)
  AND "conversationId" IN (SELECT "id" FROM "Conversation" WHERE "kind" = 'TASK');

DELETE FROM "TaskParticipant"
WHERE "employeeId" IN (SELECT "id" FROM "Employee" WHERE "active" = false AND "deactivatedAt" IS NOT NULL);
