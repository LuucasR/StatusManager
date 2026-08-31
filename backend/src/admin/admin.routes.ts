import { Router } from "express";
import PDFDocument from "pdfkit";
import prisma from "../prisma/client";
import { requireAdmin, requireAuth, requireStaff } from "../auth/auth.middleware";
import { renderActivityReport } from "../reports/activity-report";
import { emitStatusChanged, sendConfirmationRequest } from "../realtime";
import { changeStatusSchema } from "../activities/activity-validation";
import { hashPassword } from "../auth/auth.password";
import { approvePasswordReset } from "../auth/auth.service";
import { visibleHistoryWhere } from "../activities/activity-status";
import { WorkingTaskError, resolveWorkingTask } from "../activities/activity-task";
import { z } from "zod";
import { Role } from "@prisma/client";


const createEmployeeSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email(),
  password: z.string().min(8).max(72),
  role: z.nativeEnum(Role),
});

const changeRoleSchema = z.object({
  role: z.nativeEnum(Role),
});


const router = Router();

/**
 * requireAuth global, pero el nivel se decide POR RUTA: el supervisor ve al
 * equipo y sus reportes, y el admin es el unico que toca cuentas, roles y
 * estados ajenos. Antes todo el router era requireAdmin.
 */
router.use(requireAuth);



router.get("/employees", requireStaff, async (_req, res) => {
  const employees = await prisma.employee.findMany({
    select: {
      id: true,
      employeeNumber: true,
      name: true,
      email: true,
      role: true,
      currentStatus: true,
      statusSince: true,
      active: true,

      activities: {
        where: {
          endedAt: null,
        },
        take: 1,
        select: {
          detail: true,
          taskTitle: true,
        },
      },
    },
    orderBy: {
      name: "asc",
    },
  });

  res.json(
    employees.map((employee) => {
      const open = employee.activities[0];
      return {
        id: employee.id,
        employeeNumber: employee.employeeNumber,
        name: employee.name,
        email: employee.email,
        role: employee.role,
        currentStatus: employee.currentStatus,
        statusSince: employee.statusSince,
        active: employee.active,
        // Mismo fallback que GET /activities/team: el comentario dejo de ser
        // obligatorio en WORKING, asi que sin esto la tarjeta diria "Sin
        // detalle" justo para todo el que esta trabajando.
        detail: open?.detail || open?.taskTitle || "",
        taskTitle: open?.taskTitle ?? null,
      };
    })
  );
});

router.get("/password-change-requests", requireAdmin, async (_req, res) => {
  const requests = await prisma.passwordChangeRequest.findMany({
    where: { status: "PENDING" },
    select: {
      id: true,
      createdAt: true,
      employee: {
        select: {
          id: true,
          employeeNumber: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  res.json(requests);
});

router.patch("/password-change-requests/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const decision = req.body?.decision;

  if (
    !Number.isInteger(id) ||
    (decision !== "APPROVED" && decision !== "REJECTED")
  ) {
    return res.status(400).json({ message: "Solicitud o decisión inválida" });
  }

  const request = await prisma.passwordChangeRequest.findUnique({
    where: { id },
  });

  if (!request || request.status !== "PENDING") {
    return res.status(404).json({
      message: "La solicitud no existe o ya fue resuelta",
    });
  }

  if (decision === "REJECTED") {
    await prisma.passwordChangeRequest.update({
      where: { id },
      data: { status: "REJECTED", resolvedAt: new Date() },
    });
    return res.json({ message: "Solicitud rechazada" });
  }

  // Minted here, never stored in cleartext and never written to a log. It goes
  // out in this one response for the admin to read to the employee, who is then
  // forced to replace it on next login (mustChangePassword).
  //
  // The old flow instead saved the password the EMPLOYEE picked, unhashed, and
  // showed it on this same screen.
  const temporaryPassword = await approvePasswordReset(request.employeeId);

  await prisma.passwordChangeRequest.update({
    where: { id },
    data: { status: "APPROVED", resolvedAt: new Date() },
  });

  res.json({
    temporaryPassword,
    message:
      "Contraseña temporal generada. Dictásela al empleado: no se vuelve a mostrar.",
  });
});



router.get("/history", requireStaff, async (req, res) => {
  const employeeId = req.query.employeeId
    ? Number(req.query.employeeId)
    : undefined;

  const rows = await prisma.activityHistory.findMany({
    where: {
      ...visibleHistoryWhere,
      ...(Number.isFinite(employeeId) ? { employeeId } : {}),
    },
    include: {
      employee: {
        select: {
          employeeNumber: true,
          name: true,
        },
      },
    },
    orderBy: {
      startedAt: "desc",
    },
    take: 1000,
  });

  res.json(rows);
});

/**
 * Alta de cuenta hecha por el admin. A diferencia de POST /auth/register, la
 * cuenta nace ACTIVA (no hay nada que aprobar: la creo el admin) y con el rol
 * que él elija. El legajo es automático, el siguiente disponible.
 */
router.post("/employees", requireAdmin, async (req, res) => {
  const parsed = createEmployeeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      message: parsed.error.issues[0]?.message ?? "Revisá los datos ingresados",
    });
  }

  const email = parsed.data.email.toLowerCase();
  const taken = await prisma.employee.findUnique({ where: { email }, select: { id: true } });
  if (taken) {
    return res.status(409).json({ message: "Ya existe una cuenta con ese email" });
  }

  try {
    const employee = await prisma.$transaction(async (tx) => {
      const last = await tx.employee.findFirst({
        orderBy: { employeeNumber: "desc" },
        select: { employeeNumber: true },
      });
      return tx.employee.create({
        data: {
          employeeNumber: (last?.employeeNumber ?? 999) + 1,
          name: parsed.data.name,
          email,
          password: await hashPassword(parsed.data.password),
          role: parsed.data.role,
          active: true,
        },
        select: {
          id: true,
          employeeNumber: true,
          name: true,
          email: true,
          role: true,
          active: true,
        },
      });
    });

    res.status(201).json(employee);
  } catch {
    // Carrera con otra alta simultánea sobre el mismo email o legajo.
    res.status(409).json({ message: "No se pudo crear la cuenta: datos duplicados" });
  }
});

/** Cambio de rol de una cuenta existente. */
router.patch("/employees/:id/role", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ message: "Empleado inválido" });
  }

  const parsed = changeRoleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Rol inválido" });
  }

  // Cambiarse el rol a uno mismo es la forma más rápida de quedarse afuera:
  // el token vigente sigue diciendo ADMIN, pero el siguiente login ya no.
  if (id === req.auth!.employeeId) {
    return res.status(400).json({ message: "No podés cambiar tu propio rol" });
  }

  const employee = await prisma.employee.findUnique({
    where: { id },
    select: { id: true, role: true },
  });
  if (!employee) {
    return res.status(404).json({ message: "Empleado no encontrado" });
  }

  // Nadie puede dejar el sistema sin administradores: sin admin no hay forma de
  // volver a crear uno desde la app.
  if (employee.role === Role.ADMIN && parsed.data.role !== Role.ADMIN) {
    const admins = await prisma.employee.count({ where: { role: Role.ADMIN, active: true } });
    if (admins <= 1) {
      return res
        .status(400)
        .json({ message: "No podés quitar el último administrador activo" });
    }
  }

  const updated = await prisma.employee.update({
    where: { id },
    data: { role: parsed.data.role },
    select: { id: true, employeeNumber: true, name: true, email: true, role: true, active: true },
  });

  res.json(updated);
});

router.patch("/employees/:id/approve", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id)) {
    return res.status(400).json({
      message: "Empleado inválido",
    });
  }

  const employee = await prisma.employee.update({
    where: {
      id,
    },
    data: {
      active: true,
    },
    select: {
      id: true,
      employeeNumber: true,
      name: true,
      email: true,
      active: true,
    },
  });

  res.json(employee);
});

router.post("/employees/:id/request-confirmation", requireStaff, async (req, res) => {

  const employeeId = Number(req.params.id);

  if (!Number.isInteger(employeeId)) {
    return res.status(400).json({
      message: "Empleado inválido"
    });
  }

  const employee = await prisma.employee.findUnique({
    where: {
      id: employeeId
    },
    select: {
      id: true,
      name: true
    }
  });

  if (!employee) {
    return res.status(404).json({
      message: "Empleado no encontrado"
    });
  }

  const sent = sendConfirmationRequest(employeeId);

  if (!sent) {
    return res.status(400).json({
      message: "El empleado no está conectado."
    });
  }

  res.json({
    success: true
  });

});

router.post("/employees/:id/status", requireAdmin, async (req, res) => {
  const employeeId = Number(req.params.id);

  if (!Number.isInteger(employeeId)) {
    return res.status(400).json({
      message: "Empleado inválido",
    });
  }

  const parsed = changeStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      message:
        parsed.error.issues[0]?.message ??
        "No se pudo validar el cambio de estado",
    });
  }

  const now = new Date();

  // El schema es compartido con /activities/status, asi que esta ruta tambien
  // recibe taskId. Se valida contra el empleado DESTINO: sin esto un admin
  // podria imputarle el tiempo de cualquiera a una tarea donde no participa, y
  // ademas guardaria el taskId sin su snapshot de titulo.
  // `enforce: false`: corregir el estado de otro no puede quedar trabado por
  // las tareas pendientes de esa persona.
  let task;
  try {
    task = await resolveWorkingTask({
      employeeId,
      status: parsed.data.status,
      detail: parsed.data.detail,
      taskId: parsed.data.taskId,
      enforce: false,
      now,
    });
  } catch (error) {
    if (error instanceof WorkingTaskError) {
      return res.status(400).json({ message: error.message });
    }
    throw error;
  }

  const employee = await prisma.$transaction(async (tx) => {
    await tx.activityHistory.updateMany({
      where: { employeeId, endedAt: null },
      data: { endedAt: now },
    });

    await tx.activityHistory.create({
      data: {
        employeeId,
        status: parsed.data.status,
        detail: parsed.data.detail,
        startedAt: now,
        taskId: task.taskId,
        taskTitle: task.taskTitle,
      },
    });

    return tx.employee.update({
      where: { id: employeeId },
      data: {
        currentStatus: parsed.data.status,
        statusSince: now,
      },
      select: {
        id: true,
        employeeNumber: true,
        name: true,
        currentStatus: true,
        statusSince: true,
      },
    });
  });

  emitStatusChanged(employee);
  res.json({ success: true, employee });
});


router.delete("/employees/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id)) {
    return res.status(400).json({
      message: "Empleado inválido",
    });
  }

  if (id === req.auth!.employeeId) {
    return res.status(400).json({
      message: "No podés eliminar tu propia cuenta de administrador",
    });
  }

  const employee = await prisma.employee.findUnique({
    where: { id },
    select: { id: true, role: true },
  });

  if (!employee) {
    return res.status(404).json({
      message: "Empleado no encontrado",
    });
  }

  // Misma razón que en el cambio de rol: sin admins no hay forma de recuperar
  // la administración desde la app.
  if (employee.role === Role.ADMIN) {
    const admins = await prisma.employee.count({ where: { role: Role.ADMIN, active: true } });
    if (admins <= 1) {
      return res
        .status(400)
        .json({ message: "No podés eliminar el último administrador activo" });
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.activityHistory.deleteMany({
      where: { employeeId: id },
    });
    await tx.employee.delete({
      where: { id },
    });
  });

  res.json({
    success: true,
  });
});

router.get("/report.pdf", requireStaff, async (req, res) => {
  const employeeId = req.query.employeeId;

  const where: any = { ...visibleHistoryWhere };

  if (employeeId && employeeId !== "all") {
    where.employeeId = Number(employeeId);
  }

  const period = req.query.period as string | undefined;
const from = req.query.from as string | undefined;
const to = req.query.to as string | undefined;

if (period === "today") {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  where.startedAt = {
    gte: start,
  };
}

if (period === "last7") {
  const start = new Date();
  start.setDate(start.getDate() - 7);

  where.startedAt = {
    gte: start,
  };
}

if (from && to) {
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);

  const end = new Date(to);
  end.setHours(23, 59, 59, 999);

  where.startedAt = {
    gte: start,
    lte: end,
  };
}

  const rows = await prisma.activityHistory.findMany({
    where,
    include: {
      employee: {
        select: {
          employeeNumber: true,
          name: true,
        },
      },
    },
    orderBy: {
      startedAt: "desc",
    },
    take: 1000,
  });

  res.setHeader("Content-Type", "application/pdf");

  res.setHeader(
    "Content-Disposition",
    `inline; filename="reporte-actividades-${new Date()
      .toISOString()
      .slice(0, 10)}.pdf"`
  );

  const doc = new PDFDocument({
    margin: 0,
    size: "A4",
  });

  doc.pipe(res);

  let periodLabel = "Historial completo";
  if (period === "today") periodLabel = "Hoy";
  if (period === "last7") periodLabel = "Ultimos 7 dias";
  if (from && to) {
    periodLabel = `${new Date(from).toLocaleDateString("es-AR")} al ${new Date(to).toLocaleDateString("es-AR")}`;
  }

  // Se busca el empleado aparte y no en rows[0]: si en el periodo solo tuvo
  // registros ocultos (Desconectado), rows queda vacio y el subtitulo caeria
  // a "Resumen general del equipo" aunque haya un empleado filtrado.
  const selectedEmployee = employeeId && employeeId !== "all"
    ? await prisma.employee.findUnique({
        where: { id: Number(employeeId) },
        select: { employeeNumber: true, name: true },
      })
    : undefined;

  renderActivityReport(doc, {
    title: "Reporte de actividades",
    subtitle: selectedEmployee
      ? `Empleado #${selectedEmployee.employeeNumber} - ${selectedEmployee.name}`
      : "Resumen general del equipo",
    periodLabel,
    rows,
  });
});

export default router;
