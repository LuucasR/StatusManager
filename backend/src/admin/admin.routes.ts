import { Router } from "express";
import PDFDocument from "pdfkit";
import prisma from "../prisma/client";
import { requireAdmin, requireAuth } from "../auth/auth.middleware";
import { renderActivityReport } from "../reports/activity-report";
import { emitStatusChanged, sendConfirmationRequest } from "../realtime";
import { changeStatusSchema } from "../activities/activity-validation";
import { hashPassword } from "../auth/auth.password";
import { visibleHistoryWhere } from "../activities/activity-status";


const router = Router();



router.use(requireAuth, requireAdmin);



router.get("/employees", async (_req, res) => {
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
        },
      },
    },
    orderBy: {
      name: "asc",
    },
  });

  res.json(
    employees.map((employee) => ({
      id: employee.id,
      employeeNumber: employee.employeeNumber,
      name: employee.name,
      email: employee.email,
      role: employee.role,
      currentStatus: employee.currentStatus,
      statusSince: employee.statusSince,
      active: employee.active,
      detail: employee.activities[0]?.detail ?? "",
    }))
  );
});

router.get("/password-change-requests", async (_req, res) => {
  const requests = await prisma.passwordChangeRequest.findMany({
    where: { status: "PENDING" },
    select: {
      id: true,
      requestedPassword: true,
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

router.patch("/password-change-requests/:id", async (req, res) => {
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

  await prisma.$transaction(async (tx) => {
    if (decision === "APPROVED") {
      await tx.employee.update({
        where: { id: request.employeeId },
        data: { password: await hashPassword(request.requestedPassword) },
      });
    }

    await tx.passwordChangeRequest.update({
      where: { id },
      data: { status: decision, resolvedAt: new Date() },
    });
  });

  res.json({
    message:
      decision === "APPROVED"
        ? "Contraseña actualizada correctamente"
        : "Solicitud rechazada",
  });
});



router.get("/history", async (req, res) => {
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

router.patch("/employees/:id/approve", async (req, res) => {
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

router.post("/employees/:id/request-confirmation", async (req, res) => {

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

router.post("/employees/:id/status", async (req, res) => {
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


router.delete("/employees/:id", async (req, res) => {
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
    select: { id: true },
  });

  if (!employee) {
    return res.status(404).json({
      message: "Empleado no encontrado",
    });
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

router.get("/report.pdf", async (req, res) => {
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
