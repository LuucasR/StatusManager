import pino from "pino";
import pinoHttp from "pino-http";
import { randomUUID } from "node:crypto";
import { env } from "./env";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (env.NODE_ENV === "production" ? "info" : "debug"),
  // Never let a token or a password reach the log, whatever a caller sends.
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.body.password",
      "req.body.currentPassword",
      "req.body.newPassword",
      "temporaryPassword",
    ],
    censor: "[redacted]",
  },
});

/**
 * Request logging with a per-request id, echoed back as `x-request-id` so a user
 * reporting a failure can hand over the exact identifier that appears in the
 * logs. Before this the backend had four console.* calls in total and no way to
 * answer "what happened at 14:32".
 */
export const httpLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const existing = req.headers["x-request-id"];
    const id = (Array.isArray(existing) ? existing[0] : existing) ?? randomUUID();
    res.setHeader("x-request-id", id);
    return id;
  },
  // Health checks would otherwise dominate the log.
  autoLogging: { ignore: (req) => req.url === "/health" },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
});
