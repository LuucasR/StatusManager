import { Router } from "express";
import PDFDocument from "pdfkit";
import prisma from "../prisma/client";
import { requireAdmin, requireAuth } from "../auth/auth.middleware";
import { sendConfirmationRequest } from "../realtime";


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



router.get("/history", async (req, res) => {
  const employeeId = req.query.employeeId
    ? Number(req.query.employeeId)
    : undefined;

  const rows = await prisma.activityHistory.findMany({
    where: Number.isFinite(employeeId)
      ? { employeeId }
      : undefined,
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

  const { status, detail } = req.body;

  await prisma.activityHistory.updateMany({
    where: {
      employeeId,
      endedAt: null,
    },
    data: {
      endedAt: new Date(),
    },
  });

  await prisma.activityHistory.create({
    data: {
      employeeId,
      status,
      detail,
    },
  });

  await prisma.employee.update({
    where: {
      id: employeeId,
    },
    data: {
      currentStatus: status,
      statusSince: new Date(),
    },
  });

  res.json({
    success: true,
  });
});


router.delete("/employees/:id", async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id)) {
    return res.status(400).json({
      message: "Empleado inválido",
    });
  }

  await prisma.activityHistory.deleteMany({
    where: {
      employeeId: id,
    },
  });

  await prisma.employee.delete({
    where: {
      id,
    },
  });

  res.json({
    success: true,
  });
});

router.get("/report.pdf", async (req, res) => {
  const employeeId = req.query.employeeId;

  const where: any = {};

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
    `attachment; filename="reporte-actividades-${new Date()
      .toISOString()
      .slice(0, 10)}.pdf"`
  );

  const doc = new PDFDocument({
    margin: 40,
  });

  doc.pipe(res);

  doc
    .fontSize(20)
    .text("Reporte de actividades");

  doc
    .fontSize(9)
    .fillColor("#666")
    .text(`Generado: ${new Date().toLocaleString("es-AR")}`)
    .moveDown();

  for (const row of rows) {
    doc
      .fillColor("#111")
      .fontSize(10)
      .text(
        `#${row.employee.employeeNumber} ${row.employee.name} — ${row.status}`
      );

    doc
      .fillColor("#555")
      .fontSize(9)
      .text(
        `${row.startedAt.toLocaleString("es-AR")} · ${row.detail}`
      )
      .moveDown(0.5);
  }

  doc.end();
});

export default router;