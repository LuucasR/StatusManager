-- CreateEnum
CREATE TYPE "ConversationKind" AS ENUM ('DIRECT', 'GENERAL', 'TASK');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('TASK_ADDED', 'TASK_REMOVED', 'TASK_STATE', 'TASK_MESSAGE');

-- CreateTable
CREATE TABLE "Conversation" (
    "id" SERIAL NOT NULL,
    "kind" "ConversationKind" NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "taskId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessageAt" TIMESTAMP(3),

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationMember" (
    "conversationId" INTEGER NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReadAt" TIMESTAMP(3),

    CONSTRAINT "ConversationMember_pkey" PRIMARY KEY ("conversationId","employeeId")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" SERIAL NOT NULL,
    "conversationId" INTEGER NOT NULL,
    "authorId" INTEGER,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" SERIAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "taskId" INTEGER,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_key_key" ON "Conversation"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_taskId_key" ON "Conversation"("taskId");

-- CreateIndex
CREATE INDEX "Conversation_lastMessageAt_idx" ON "Conversation"("lastMessageAt");

-- CreateIndex
CREATE INDEX "ConversationMember_employeeId_idx" ON "ConversationMember"("employeeId");

-- CreateIndex
CREATE INDEX "Message_conversationId_id_idx" ON "Message"("conversationId", "id");

-- CreateIndex
CREATE INDEX "Notification_employeeId_createdAt_idx" ON "Notification"("employeeId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_employeeId_readAt_idx" ON "Notification"("employeeId", "readAt");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMember" ADD CONSTRAINT "ConversationMember_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMember" ADD CONSTRAINT "ConversationMember_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Migracion de datos: los comentarios de tarea pasan a ser el chat de la tarea.
-- Esta migracion SOLO copia. El DROP de "TaskComment" va en la migracion
-- siguiente, despues de verificar los conteos contra la base real.
-- ---------------------------------------------------------------------------

-- Canal general (singleton, garantizado por el unique de "key")
INSERT INTO "Conversation" ("kind", "key", "title", "closed", "createdAt")
VALUES ('GENERAL', 'general', 'General', false, CURRENT_TIMESTAMP);

-- Una conversacion por cada tarea existente, cerrada si la tarea ya esta Terminada
INSERT INTO "Conversation" ("kind", "key", "title", "closed", "taskId", "createdAt")
SELECT 'TASK', 't:' || t."id", t."title", (t."state" = 'DONE'), t."id", t."createdAt"
FROM "Task" t;

-- Miembros = participantes actuales, preservando la fecha de alta
INSERT INTO "ConversationMember" ("conversationId", "employeeId", "joinedAt")
SELECT c."id", tp."employeeId", tp."addedAt"
FROM "TaskParticipant" tp
JOIN "Conversation" c ON c."taskId" = tp."taskId";

-- Comentarios -> mensajes, preservando autor, nombre y fecha original
INSERT INTO "Message" ("conversationId", "authorId", "authorName", "body", "createdAt")
SELECT c."id", tc."authorId", e."name", tc."body", tc."createdAt"
FROM "TaskComment" tc
JOIN "Conversation" c ON c."taskId" = tc."taskId"
JOIN "Employee" e ON e."id" = tc."authorId";

-- Ultimo mensaje por conversacion, para ordenar la lista del chat
UPDATE "Conversation" c
SET "lastMessageAt" = m."maxAt"
FROM (
    SELECT "conversationId", MAX("createdAt") AS "maxAt"
    FROM "Message"
    GROUP BY "conversationId"
) m
WHERE m."conversationId" = c."id";
