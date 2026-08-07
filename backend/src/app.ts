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

if (process.env.NODE_ENV === "production") {
  // Acotado a las rutas de siempre: 100 req / 15 min es razonable para el
  // dashboard, pero un chat abierto lo agota en un par de minutos (cada
  // mensaje enviado, cada marca de leido, cada paginacion cuenta).
  app.use(
    ["/auth", "/activities", "/admin", "/tasks"],
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 100,
      standardHeaders: true,
    })
  );

  app.use(
    ["/chat", "/notifications"],
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 900,
      standardHeaders: true,
    })
  );
}

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