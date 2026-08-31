import { z } from "zod";

/**
 * Environment contract, checked once at boot.
 *
 * Before this existed the server started happily without JWT_SECRET and only
 * fell over at the first login attempt, which made a misconfigured deploy look
 * healthy. Failing here means a bad deploy dies immediately and visibly.
 *
 * Import this module before anything that reads process.env.
 */
/** Treats an empty variable as absent: a blank value in a dashboard is a
 *  missing value, not a valid one. */
const required = (name: string) =>
  z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string({ error: `${name} is required` })
  );

const schema = z.object({
  // Consumed by Prisma through env() in schema.prisma rather than by our code,
  // so nothing else would have caught it missing.
  DATABASE_URL: required("DATABASE_URL"),
  JWT_SECRET: required("JWT_SECRET"),
  // Origin allowed by CORS and by the Socket.IO handshake. Optional because
  // localhost is always allowed, which is enough for local development.
  FRONTEND_URL: z.string().url().optional(),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  throw new Error(`Invalid environment configuration:\n${details}`);
}

export const env = parsed.data;

/**
 * Warned about rather than rejected on purpose. A short secret is a real
 * weakness, but refusing to boot over it would take a running production
 * deployment down on upgrade, which is worse than the risk it prevents. Rotate
 * it deliberately instead.
 */
if (env.JWT_SECRET.length < 32) {
  console.warn(
    `[env] JWT_SECRET is ${env.JWT_SECRET.length} characters. Use at least 32 random characters; a short secret is brute-forceable offline.`
  );
}
