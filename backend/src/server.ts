import "dotenv/config";
import { createServer } from "node:http";
import { env } from "./env";
import { logger } from "./logger";
import app from "./app";
import { initializeRealtime } from "./realtime";

const server = createServer(app);
initializeRealtime(server);
server.listen(env.PORT, () =>
  logger.info({ port: env.PORT, env: env.NODE_ENV }, "server listening")
);

// Without these, a crash in async code that never reached a request handler
// died silently. Log first, then let the process go: a half-broken instance
// should be replaced, not kept alive.
process.on("unhandledRejection", (reason) => {
  logger.fatal({ err: reason }, "unhandled rejection");
  process.exit(1);
});
process.on("uncaughtException", (error) => {
  logger.fatal({ err: error }, "uncaught exception");
  process.exit(1);
});
