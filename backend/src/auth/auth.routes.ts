import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  forgotPasswordController,
  loginController,
  registerController,
  resetPasswordController,
} from "./auth.controller";

const router = Router();
const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Demasiados intentos. Probá nuevamente en unos minutos.",
  },
});

router.post("/login", loginController);
router.post("/register", registerController);
router.post("/forgot-password", passwordResetLimiter, forgotPasswordController);
router.post("/reset-password", resetPasswordController);

export default router;
