import type { ErrorRequestHandler, RequestHandler } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { logger } from "../logger";

/**
 * Catch-all for unmatched routes. Mounted after every router.
 *
 * Its own code, NOT the NOT_FOUND used for a missing row. Both are 404s but they
 * mean completely different things, and sharing a code made the client render
 * "that record does not exist" when the real problem was that the endpoint was
 * not there at all - which points whoever is debugging at the wrong layer.
 */
export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ code: "ROUTE_NOT_FOUND", message: "Route not found" });
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
      message: error.issues[0]?.message ?? "Invalid data",
    };
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case "P2002":
        return {
          status: 409,
          code: "DUPLICATE_VALUE",
          message: "A record with those details already exists",
        };
      case "P2025":
        return {
          status: 404,
          code: "NOT_FOUND",
          message: "That record does not exist",
        };
      case "P2003":
        return {
          status: 409,
          code: "RELATED_RECORD_MISSING",
          message: "The related record does not exist",
        };
    }
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return { status: 400, code: "VALIDATION_ERROR", message: "Invalid data" };
  }

  return {
    status: 500,
    code: "INTERNAL_ERROR",
    message: "Something went wrong",
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
