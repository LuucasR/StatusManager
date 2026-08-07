import { Router } from "express";
import PDFDocument from "pdfkit";
import { z } from "zod";
import prisma from "../prisma/client";
import { requireAuth } from "../auth/auth.middleware";
import { emitStatusChanged, confirmActivity } from "../realtime";
import { renderActivityReport } from "../reports/activity-report";
import { changeStatusSchema } from "./activity-validation";
import { overlappingWhere, visibleHistoryWhere } from "./activity-status";
import {
  WorkingTaskError,
  listAssignableTasks,
  resolveWorkingTask,
} from "./activity-task";
import { summarize } from "./activity-summary";

const router = Router();
router.use(requireAuth);

/** Tope del historial en pantalla. Se avisa cuando se recorta. */
const HISTORY_TAKE = 500;

/**
 * `new Date("2026-08-01")` es medianoche UTC, no local: en AR el rango
 * arrancaba el dia anterior a las 21:00. El frontend manda ISO completos con
 * offset; aca solo se valida, para que un `?from=basura` sea 400 y no un 500 de
 * Prisma con `Invalid Date`.
 */
const rangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

function parseRange(query: unknown) {
  return rangeSchema.safeParse(query);
}

/** Datos de tarea que acompañan a un tramo del historial. */
const HISTORY_TASK_INCLUDE = {
  select: { id: true, title: true, state: true },
} as const;

router.get("/me", async (req, res) => {
  const employee = await prisma.employee.findUnique({
    where: { id: req.auth!.employeeId },
    select: { id: true, employeeNumber: true, name: true, email: true, role: true, currentStatus: true, statusSince: true },
  });
  res.json(employee);
});

router.get("/team", async (_req, res) => {
  const employees = await prisma.employee.findMany({
    where: { active: true },
    select: {
      id: true,
      employeeNumber: true,
      name: true,
      role: true,
      currentStatus: true,
      statusSince: true,
      activities: {
        where: { endedAt: null },
        take: 1,
        select: { detail: true, taskTitle: true },
      },
    },
    orderBy: { name: "asc" },
  });

  res.json(
    employees.map((employee) => {
      const open = employee.activities[0];
      return {
        id: employee.id,
        employeeNumber: employee.employeeNumber,
        name: employee.name,
        role: employee.role,
        currentStatus: employee.currentStatus,
        statusSince: employee.statusSince,
        active: true,
        // Fallback al titulo de la tarea: el comentario dejo de ser obligatorio
        // en WORKING, y sin esto la tarjeta diria "Sin detalle" justo para todo
        // el que esta trabajando.
        detail: open?.detail || open?.taskTitle || "",
        taskTitle: open?.taskTitle ?? null,
      };
    })
  );
});

/** Tareas que el empleado puede declarar al ponerse a Trabajar. */
router.get("/assignable-tasks", async (req, res) => {
  res.json(await listAssignableTasks(req.auth!.employeeId));
});

router.get("/history", async (req, res) => {
  const range = parseRange(req.query);
  if (!range.success) {
    return res.status(400).json({ message: "Rango de fechas inválido" });
  }
  const { from, to } = range.data;

  const rows = await prisma.activityHistory.findMany({
    where: {
      employeeId: req.auth!.employeeId,
      ...visibleHistoryWhere,
      ...overlappingWhere(from, to),
    },
    include: { task: HISTORY_TASK_INCLUDE },
    orderBy: { startedAt: "desc" },
    take: HISTORY_TAKE + 1,
  });

  // Se pide uno de mas para poder AVISAR que se recorto: con un tope mudo, la
  // tabla y el resumen mostraban totales distintos para el mismo rango sin
  // ninguna forma de darse cuenta.
  const truncated = rows.length > HISTORY_TAKE;
  res.json({ rows: truncated ? rows.slice(0, HISTORY_TAKE) : rows, truncated });
});

/**
 * Resumen agregado del periodo. Siempre del empleado autenticado: NO acepta
 * `employeeId`, el resumen de equipo no existe y agregar el parametro sin un
 * requireStaff seria una fuga.
 */
router.get("/summary", async (req, res) => {
  const range = parseRange(req.query);
  if (!range.success) {
    return res.status(400).json({ message: "Rango de fechas inválido" });
  }
  const { from, to } = range.data;

  const rows = await prisma.activityHistory.findMany({
    where: {
      employeeId: req.auth!.employeeId,
      ...visibleHistoryWhere,
      ...overlappingWhere(from, to),
    },
    include: {
      // Sin filtro de archivado a proposito: el resumen es historia, no
      // pizarra. Si filtrara por visibleTasksWhere, todo lo anterior a 14 dias
      // del fin de la tarea aparecería sin integrantes ni estado.
      task: {
        select: {
          id: true,
          title: true,
          state: true,
          startsAt: true,
          endsAt: true,
          description: true,
          createdBy: { select: { id: true, employeeNumber: true, name: true } },
          participants: {
            select: { employee: { select: { id: true, employeeNumber: true, name: true } } },
            orderBy: { addedAt: "asc" },
          },
        },
      },
    },
    orderBy: { startedAt: "desc" },
  });

  res.json({
    from: from ?? null,
    to: to ?? null,
    ...summarize(rows, from, to),
  });
});

router.get("/report.pdf", async (req, res) => {
  const range = parseRange(req.query);
  if (!range.success) {
    return res.status(400).json({ message: "Rango de fechas inválido" });
  }
  const { from, to } = range.data;

  const employee = await prisma.employee.findUniqueOrThrow({ where: { id: req.auth!.employeeId } });
  const rows = await prisma.activityHistory.findMany({
    where: {
      employeeId: req.auth!.employeeId,
      ...visibleHistoryWhere,
      ...overlappingWhere(from, to),
    },
    orderBy: { startedAt: "desc" },
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", 'inline; filename="mi-actividad.pdf"');
  const doc = new PDFDocument({ margin: 0, size: "A4" });
  doc.pipe(res);
  const periodLabel = from || to
    ? `${from ? from.toLocaleDateString("es-AR") : "Inicio"} al ${to ? to.toLocaleDateString("es-AR") : "presente"}`
    : "Historial completo";

  renderActivityReport(doc, {
    title: "Mi registro de actividades",
    subtitle: `Empleado #${employee.employeeNumber} - ${employee.name}`,
    periodLabel,
    rows: rows.map((row) => ({
      ...row,
      employee: {
        employeeNumber: employee.employeeNumber,
        name: employee.name,
      },
    })),
  });
});


router.post("/confirm-activity", (req, res) => {

  const confirmed = confirmActivity(req.auth!.employeeId);

  if (!confirmed) {
    return res.status(400).json({
      message: "No hay ninguna confirmación pendiente."
    });
  }

  res.json({
    success: true
  });

});


router.post("/status", async (req, res) => {
  const parsed = changeStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      message:
        parsed.error.issues[0]?.message ??
        "No se pudo validar el cambio de estado",
    });
  }

  const now = new Date();

  // Fuera de la transaccion: son lecturas, y si rechaza no hay nada que
  // deshacer. `enforce` solo aca — el admin no queda atado a las tareas ajenas.
  let task;
  try {
    task = await resolveWorkingTask({
      employeeId: req.auth!.employeeId,
      status: parsed.data.status,
      detail: parsed.data.detail,
      taskId: parsed.data.taskId,
      enforce: true,
      now,
    });
  } catch (error) {
    if (error instanceof WorkingTaskError) {
      return res.status(400).json({ message: error.message });
    }
    throw error;
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.activityHistory.updateMany({
      where: { employeeId: req.auth!.employeeId, endedAt: null },
      data: { endedAt: now },
    });
    const activity = await tx.activityHistory.create({
      data: {
        employeeId: req.auth!.employeeId,
        status: parsed.data.status,
        detail: parsed.data.detail,
        startedAt: now,
        taskId: task.taskId,
        taskTitle: task.taskTitle,
      },
    });
    const employee = await tx.employee.update({
      where: { id: req.auth!.employeeId },
      data: { currentStatus: parsed.data.status, statusSince: now },
      select: { id: true, employeeNumber: true, name: true, currentStatus: true, statusSince: true },
    });
    return { activity, employee };
  });
  emitStatusChanged(result.employee);
  res.status(201).json(result);
});

export default router;
