import { Router } from "express";
import PDFDocument from "pdfkit";
import prisma from "../prisma/client";
import { requireAdmin, requireAuth } from "../auth/auth.middleware";

const router = Router();
router.use(requireAuth, requireAdmin);

router.get("/employees", async (_req, res) => {
  const employees = await prisma.employee.findMany({
    select: { id: true, employeeNumber: true, name: true, email: true, role: true, currentStatus: true, statusSince: true, active: true },
    orderBy: { name: "asc" },
  });
  res.json(employees);
});

router.get("/history", async (req, res) => {
  const employeeId = req.query.employeeId ? Number(req.query.employeeId) : undefined;
  const rows = await prisma.activityHistory.findMany({
    where: Number.isFinite(employeeId) ? { employeeId } : undefined,
    include: { employee: { select: { employeeNumber: true, name: true } } },
    orderBy: { startedAt: "desc" },
    take: 1000,
  });
  res.json(rows);
});

router.patch("/employees/:id/approve", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ message: "Empleado inválido" });
  const employee = await prisma.employee.update({
    where: { id },
    data: { active: true },
    select: { id: true, employeeNumber: true, name: true, email: true, active: true },
  });
  res.json(employee);
});

router.get("/report.pdf", async (_req, res) => {
  const rows = await prisma.activityHistory.findMany({
    include: { employee: { select: { employeeNumber: true, name: true } } },
    orderBy: { startedAt: "desc" },
    take: 1000,
  });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="reporte-actividades-${new Date().toISOString().slice(0, 10)}.pdf"`);
  const doc = new PDFDocument({ margin: 40 });
  doc.pipe(res);
  doc.fontSize(20).text("Reporte de actividades");
  doc.fontSize(9).fillColor("#666").text(`Generado: ${new Date().toLocaleString("es-AR")}`).moveDown();
  for (const row of rows) {
    doc.fillColor("#111").fontSize(10).text(`#${row.employee.employeeNumber} ${row.employee.name} — ${row.status}`);
    doc.fillColor("#555").fontSize(9).text(`${row.startedAt.toLocaleString("es-AR")} · ${row.detail}`).moveDown(0.5);
  }
  doc.end();
});

export default router;
