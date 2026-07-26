import express from "express";
import cors from "cors";
import authRoutes from "./auth/auth.routes";
import activitiesRoutes from "./activities/activities.routes";
import adminRoutes from "./admin/admin.routes";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import compression from "compression";

const app = express();
app.use(helmet());
app.use(compression());
if (process.env.NODE_ENV === "production") {
    app.use(
        rateLimit({
            windowMs: 15 * 60 * 1000,
            max: 100,
            standardHeaders: true,
        })
    );
}
app.use(cors({
    origin: process.env.FRONTEND_URL ?? "http://localhost:5173",
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
}));
app.use(express.json({ limit: "100kb" }));
app.use("/auth", authRoutes);
app.use("/activities", activitiesRoutes);
app.use("/admin", adminRoutes);
app.get("/health", (_req, res) => res.json({ status: "OK" }));
app.use((_req, res) => res.status(404).json({ message: "Ruta no encontrada" }));
export default app;
