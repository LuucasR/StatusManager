import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  changePasswordController,
  forgotPasswordController,
  loginController,
  registerController,
} from "./auth.controller";
import { requireAuthForPasswordChange } from "./auth.middleware";

const router = Router();

/**
 * Both endpoints create rows on behalf of an anonymous caller, so the limit is
 * the only thing standing between the public internet and unbounded inserts.
 * `/register` was previously unthrottled: anyone could spam pending sign-ups and
 * push `employeeNumber` up indefinitely, since it is allocated as max+1.
 */
const anonymousWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: "RATE_LIMITED", message: "Too many attempts. Try again in a few minutes.",
  },
});

router.post("/login", loginController);
router.post("/register", anonymousWriteLimiter, registerController);
router.post("/forgot-password", anonymousWriteLimiter, forgotPasswordController);

// Uses the permissive guard on purpose: this is the only route that has to stay
// reachable while mustChangePassword is set, or the forced change deadlocks.
router.post(
  "/change-password",
  requireAuthForPasswordChange,
  changePasswordController
);

export default router;
