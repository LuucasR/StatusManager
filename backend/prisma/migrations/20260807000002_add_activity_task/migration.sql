-- Tarea declarada al pasar a WORKING, mas el snapshot del titulo para que el
-- resumen sobreviva al borrado de la tarea.
ALTER TABLE "ActivityHistory" ADD COLUMN "taskId" INTEGER,
                              ADD COLUMN "taskTitle" TEXT;

ALTER TABLE "ActivityHistory" ADD CONSTRAINT "ActivityHistory_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- El agrupado por tarea del resumen seria seq scan sin esto.
CREATE INDEX "ActivityHistory_taskId_idx" ON "ActivityHistory"("taskId");
