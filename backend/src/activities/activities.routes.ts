import { Router } from "express";
import { ActivityStatus } from "@prisma/client";
import { z } from "zod";
import PDFDocument from "pdfkit";
import prisma from "../prisma/client";
import { requireAuth } from "../auth/auth.middleware";
import { emitStatusChanged, confirmActivity } from "../realtime";
import { notifyAdmin } from "../email";

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
  const doc = new PDFDocument({ margin: 40 });
  doc.pipe(res);
  doc.fontSize(20).text("Mi registro de actividades");
  doc.fontSize(10).fillColor("#555").text(`#${employee.employeeNumber} · ${employee.name}`).moveDown();
  for (const row of rows) {
    doc.fillColor("#111").fontSize(10).text(`${row.status} — ${row.startedAt.toLocaleString("es-AR")}`);
    doc.fillColor("#555").fontSize(9).text(row.detail).moveDown(0.5);
  }
  doc.end();
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
