import "dotenv/config";
import { createServer } from "node:http";
import { env } from "./env";
import { logger } from "./logger";
import app from "./app";
import { initializeRealtime } from "./realtime";
import { registerConfirmationHandlers } from "./activities/activity-confirmation";
import { startScheduler } from "./scheduler";

const server = createServer(app);
initializeRealtime(server);

// Before the scheduler: the end-of-day job can auto-disconnect an offline
// employee on its very first tick, and that path goes through this handler.
registerConfirmationHandlers();
startScheduler();
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
