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
  // /auth es el unico que sigue en 100: ahi el limite ES la defensa (fuerza
  // bruta de login), no una cuota de uso.
  app.use(
    ["/auth"],
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 100,
      standardHeaders: true,
    })
  );

  // El resto comparte el bucket holgado. 100 req / 15 min alcanzaba cuando el
  // dashboard cargaba una vez, pero hoy cada `status:changed` de CUALQUIER
  // integrante dispara un load() completo, y a eso se le suman el selector de
  // tareas, el resumen y el historial con filtros: con 10 personas activas se
  // agotaba en minutos. Lo mismo valia para el chat, que gasta una request por
  // mensaje, por marca de leido y por paginacion.
  app.use(
    ["/activities", "/admin", "/tasks", "/chat", "/notifications"],
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