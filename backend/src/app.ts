import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";

import authRoutes from "./auth/auth.routes";
import activitiesRoutes from "./activities/activities.routes";
import adminRoutes from "./admin/admin.routes";
import tasksRoutes from "./tasks/tasks.routes";
import chatRoutes from "./chat/chat.routes";
import notificationsRoutes from "./notifications/notifications.routes";

const app = express();
app.set("trust proxy", 1);

const allowedOrigins = [
  "http://localhost:5173",
  process.env.FRONTEND_URL,
].filter((origin): origin is string => Boolean(origin));

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(helmet());
app.use(compression());

/**
 * Rate limits apply in every environment. They used to sit behind a
 * NODE_ENV === "production" check, which left staging unprotected and meant the
 * limits were never exercised before they met real traffic.
 *
 * Caveat: the default MemoryStore is per-process and resets on restart, so
 * these limits do not hold across a redeploy or a second instance. A shared
 * store is required before scaling out.
 */

// /auth stays at 100: here the limit IS the defense (login brute force), not a
// usage quota.
app.use(
  ["/auth"],
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
  })
);

// Everything else shares a roomy bucket. 100 req / 15 min was enough when the
// dashboard loaded once, but today every `status:changed` from ANY member
// triggers a full load(), plus the task selector, the summary and the filtered
// history: with 10 active people it drained in minutes. Same for chat, which
// spends a request per message, per read receipt and per page.
app.use(
  ["/activities", "/admin", "/tasks", "/chat", "/notifications"],
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 900,
    standardHeaders: true,
  })
);

app.use(express.json({ limit: "100kb" }));

app.use("/auth", authRoutes);
app.use("/activities", activitiesRoutes);
app.use("/admin", adminRoutes);
app.use("/tasks", tasksRoutes);
app.use("/chat", chatRoutes);
app.use("/notifications", notificationsRoutes);

app.get("/health", (_req, res) => {
  res.json({ status: "OK" });
});

app.use((_req, res) => {
  res.status(404).json({ message: "Ruta no encontrada" });
});

export default app;