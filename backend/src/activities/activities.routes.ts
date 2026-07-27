import { Router } from "express";
import { ActivityStatus } from "@prisma/client";
import { z } from "zod";
import PDFDocument from "pdfkit";
import prisma from "../prisma/client";
import { requireAuth } from "../auth/auth.middleware";
import { emitStatusChanged, confirmActivity } from "../realtime";
import { notifyAdmin } from "../email";
import { renderActivityReport } from "../reports/activity-report";

const router = Router();
router.use(requireAuth);

router.get("/me", async (req, res) => {
  const employee = await prisma.employee.findUnique({
    where: { id: req.auth!.employeeId },
    select: { id: true, employeeNumber: true, name: true, email: true, role: true, currentStatus: true, statusSince: true },
  });
  res.json(employee);
});

router.get("/history", async (req, res) => {
  const from = req.query.from ? new Date(String(req.query.from)) : undefined;
  const to = req.query.to ? new Date(String(req.query.to)) : undefined;
  const rows = await prisma.activityHistory.findMany({
    where: { employeeId: req.auth!.employeeId, startedAt: { gte: from, lte: to } },
    orderBy: { startedAt: "desc" },
    take: 100,
  });
  res.json(rows);
});

router.get("/report.pdf", async (req, res) => {
  const from = req.query.from ? new Date(String(req.query.from)) : undefined;
  const to = req.query.to ? new Date(String(req.query.to)) : undefined;
  const employee = await prisma.employee.findUniqueOrThrow({ where: { id: req.auth!.employeeId } });
  const rows = await prisma.activityHistory.findMany({
    where: { employeeId: req.auth!.employeeId, startedAt: { gte: from, lte: to } },
    orderBy: { startedAt: "desc" },
  });
  
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", 'attachment; filename="mi-actividad.pdf"');
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
  const parsed = z.object({ status: z.nativeEnum(ActivityStatus), detail: z.string().trim().min(3).max(500) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "El estado y un detalle de al menos 3 caracteres son obligatorios" });
  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    await tx.activityHistory.updateMany({
      where: { employeeId: req.auth!.employeeId, endedAt: null },
      data: { endedAt: now },
    });
    const activity = await tx.activityHistory.create({
      data: { employeeId: req.auth!.employeeId, status: parsed.data.status, detail: parsed.data.detail, startedAt: now },
    });
    const employee = await tx.employee.update({
      where: { id: req.auth!.employeeId },
      data: { currentStatus: parsed.data.status, statusSince: now },
      select: { id: true, employeeNumber: true, name: true, currentStatus: true, statusSince: true },
    });
    return { activity, employee };
  });
  emitStatusChanged(result.employee);
  void notifyAdmin({
    subject: `${result.employee.name} cambió su estado`,
    text: `Nuevo estado: ${result.employee.currentStatus}. Detalle: ${parsed.data.detail}`,
  });
  res.status(201).json(result);
});

export default router;
