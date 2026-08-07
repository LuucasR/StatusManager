import { Router } from "express";
import prisma from "../prisma/client";
import { requireAuth } from "../auth/auth.middleware";
import { NOTIFICATION_SELECT } from "./notification.service";

const router = Router();
router.use(requireAuth);

function parseId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Bandeja + contador en un solo round-trip, que es lo que necesita la campana. */
router.get("/", async (req, res) => {
  const employeeId = req.auth!.employeeId;
  const before = parseId(req.query.before);
  const rawLimit = Number(req.query.limit);
  const limit = Number.isInteger(rawLimit) ? Math.min(Math.max(rawLimit, 1), 50) : 20;

  const rows = await prisma.notification.findMany({
    where: { employeeId, ...(before ? { id: { lt: before } } : {}) },
    orderBy: { id: "desc" },
    take: limit + 1,
    select: NOTIFICATION_SELECT,
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const unreadCount = await prisma.notification.count({ where: { employeeId, readAt: null } });

  res.json({
    items,
    hasMore,
    nextBefore: items.length ? items[items.length - 1].id : null,
    unreadCount,
  });
});

router.get("/unread-count", async (req, res) => {
  const count = await prisma.notification.count({
    where: { employeeId: req.auth!.employeeId, readAt: null },
  });
  res.json({ count });
});

router.post("/:id/read", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: "Identificador inválido" });

  // updateMany con employeeId en el where, y NO update({ where: { id } }): es
  // lo que impide marcar como leida la notificacion de otra persona.
  const result = await prisma.notification.updateMany({
    where: { id, employeeId: req.auth!.employeeId },
    data: { readAt: new Date() },
  });
  if (result.count === 0) {
    return res.status(404).json({ message: "Notificación no encontrada" });
  }

  const unreadCount = await prisma.notification.count({
    where: { employeeId: req.auth!.employeeId, readAt: null },
  });
  res.json({ success: true, unreadCount });
});

router.post("/read-all", async (req, res) => {
  await prisma.notification.updateMany({
    where: { employeeId: req.auth!.employeeId, readAt: null },
    data: { readAt: new Date() },
  });
  res.json({ success: true, unreadCount: 0 });
});

export default router;
