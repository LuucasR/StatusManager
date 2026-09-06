import { env } from "../env";

/**
 * The one list of origins allowed to talk to this API.
 *
 * It lives here rather than in app.ts because the Socket.IO handshake enforces
 * CORS separately from Express. Those two used to carry different lists -
 * realtime.ts accepted a single origin where app.ts accepted two - and the
 * failure that produces is nasty to diagnose: every request works and only the
 * live updates are missing.
 *
 * The localhost entries are NOT the dev server. A Capacitor WebView serves the
 * bundled app from a local scheme handler, so its origin is `http://localhost`
 * or `https://localhost` with NO PORT - both distinct origins from the Vite
 * dev server's `http://localhost:5173`. They are hardcoded because they are
 * properties of the runtime, not of a deployment, so there is nothing for an
 * operator to configure.
 */
export const allowedOrigins = [
  "http://localhost:5173", // Vite dev server
  "http://localhost", // Android app, androidScheme: "http"
  "https://localhost", // Android app, androidScheme: "https"
  "capacitor://localhost", // iOS, if it is ever built
  ...env.FRONTEND_URL,
];
