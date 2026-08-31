import type { ErrorRequestHandler, RequestHandler } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { logger } from "../logger";

/** Catch-all for unmatched routes. Mounted after every router. */
export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ code: "NOT_FOUND", message: "Ruta no encontrada" });
};

type Mapped = { status: number; code: string; message: string };

/**
 * Translates the errors we can recognise into an answer the client can act on.
 * Anything unrecognised stays a generic 500: the details go to the log, never to
 * the response, so an internal failure cannot leak a stack trace or a query.
 */
function mapError(error: unknown): Mapped {
  if (error instanceof ZodError) {
    return {
      status: 400,
      code: "VALIDATION_ERROR",
      message: error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case "P2002":
        return {
          status: 409,
          code: "DUPLICATE_VALUE",
          message: "Ya existe un registro con esos datos",
        };
      case "P2025":
        return {
          status: 404,
          code: "NOT_FOUND",
          message: "El registro no existe",
        };
      case "P2003":
        return {
          status: 409,
          code: "RELATED_RECORD_MISSING",
          message: "El registro relacionado no existe",
        };
    }
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return { status: 400, code: "VALIDATION_ERROR", message: "Datos inválidos" };
  }

  return {
    status: 500,
    code: "INTERNAL_ERROR",
    message: "Ocurrió un error inesperado",
  };
}

/**
 * Express 5 forwards rejected promises from handlers here automatically, so
 * routes do not need try/catch to be covered. Must keep four parameters:
 * that arity is how Express recognises error middleware.
 */
export const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  // A stream that already started (the PDF reports) cannot be turned into a JSON
  // error; let Express abort the connection instead of corrupting the body.
  if (res.headersSent) return next(error);

  const mapped = mapError(error);
  const log = req.log ?? logger;

  if (mapped.status >= 500) {
    log.error({ err: error }, "unhandled error");
  } else {
    log.warn({ err: error, code: mapped.code }, "request failed");
  }

  res.status(mapped.status).json({ code: mapped.code, message: mapped.message });
};
