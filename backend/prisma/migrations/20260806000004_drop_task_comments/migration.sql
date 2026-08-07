-- Los comentarios de tarea ya viven en "Message" desde 20260806000003.
-- Catch-up defensivo: cualquier comentario escrito por codigo viejo entre el
-- backfill y el reinicio del proceso se copia antes de dropear la tabla.
INSERT INTO "Message" ("conversationId", "authorId", "authorName", "body", "createdAt")
SELECT c."id", tc."authorId", e."name", tc."body", tc."createdAt"
FROM "TaskComment" tc
JOIN "Conversation" c ON c."taskId" = tc."taskId"
JOIN "Employee" e ON e."id" = tc."authorId"
WHERE NOT EXISTS (
  SELECT 1 FROM "Message" m
  WHERE m."conversationId" = c."id"
    AND m."createdAt" = tc."createdAt"
    AND m."body" = tc."body"
);

-- DropTable
DROP TABLE "TaskComment";
