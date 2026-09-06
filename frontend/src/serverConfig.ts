import { isNative } from "./native/platform";

/** Sits alongside the other client-owned keys: "token", "language", "theme". */
const STORAGE_KEY = "serverUrl";

/**
 * Where the app looks unless it has been told otherwise.
 *
 * Without this, twelve people would each have to be walked through typing a
 * server address before they could sign in - and the address means nothing to
 * them. With it the app simply works on first open, and the setup screen only
 * exists for the case where this is empty.
 *
 * Overridable: whatever the user saves wins over this, so moving the backend
 * does not strand anyone on an old build. Changing it here only affects people
 * who have never set one by hand.
 */
const DEFAULT_SERVER_URL = "https://statusmanager-api.onrender.com";

/**
 * Vite inlines VITE_* at BUILD time, and for the web deployment that is still
 * how the API is found - nothing about the browser build changes here.
 *
 * The app is the reason this module exists. One APK is meant to work against
 * any server - the office LAN today, a hosted backend later - and a build-time
 * constant cannot express that, because the person installing the APK is not
 * the person who built it. So on native, and only on native, the address is
 * asked for once and remembered.
 */
const BUILT_IN = import.meta.env.VITE_API_URL as string | undefined;

function readStored(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    // Blocked storage: behave as though nothing was ever saved and ask again.
    return "";
  }
}

function resolveInitial(): string {
  if (BUILT_IN) return BUILT_IN;
  // A saved address always wins; the default is only the starting point.
  if (isNative()) return readStored() || DEFAULT_SERVER_URL;
  if (import.meta.env.PROD) {
    // Unchanged on purpose. A production web build that silently fell back to
    // localhost shipped fine and then failed at every request with no hint as
    // to why; failing here keeps that misconfiguration loud.
    throw new Error(
      "VITE_API_URL is missing. It has to be set when the frontend is built, " +
        "otherwise the app points at localhost and nothing works."
    );
  }
  return "http://localhost:3000";
}

let current = resolveInitial();

export const getApiUrl = () => current;

/** False only in the app before an address has been chosen. */
export const hasApiUrl = () => Boolean(current);

/**
 * Whether the user is allowed to pick the server, i.e. this is the APK. A build
 * with the URL baked in must not grow a control that cannot change anything.
 */
export const isRuntimeConfigurable = () => !BUILT_IN && isNative();

/**
 * "192.168.1.20:3000" -> "http://192.168.1.20:3000". Returns null if it cannot
 * be read as an address at all.
 *
 * The scheme is optional because nobody types it, and http is the right guess:
 * the address people will be entering is a machine on their own network.
 */
export function normalizeServerUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname) return null;
    // The path is kept, because a reverse-proxied deployment can legitimately
    // live under one (/api). Only the trailing slash goes, so the address never
    // joins with the request path as "//activities/me".
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

/**
 * Why an address was rejected. A stable code rather than a message, matching
 * how the API's errors are handled: the UI translates on the code and the
 * wording can change without breaking anything.
 */
export type ServerCheck =
  | "ok"
  | "invalid-url"
  | "unreachable"
  | "not-a-server"
  | "database-down";

/**
 * Confirms something is actually listening before the address is saved.
 *
 * Reuses GET /health, which already touches Postgres, so the three ways this
 * goes wrong stay distinguishable: nothing answered, something answered but it
 * is not this API, or it is this API and its database is down. Without the
 * probe a typo would be indistinguishable from a server that is simply off,
 * and the user would meet it as a failed login instead.
 */
export async function checkServer(
  input: string
): Promise<{ result: ServerCheck; url?: string }> {
  const url = normalizeServerUrl(input);
  if (!url) return { result: "invalid-url" };

  try {
    const response = await fetch(`${url}/health`, {
      signal: AbortSignal.timeout(8000),
    });
    const data = (await response.json().catch(() => null)) as
      | { status?: unknown; database?: unknown }
      | null;

    // A router's login page or a random proxy answers 200 with something else
    // entirely; the shape is what identifies the server, not the status code.
    if (!data || typeof data.status !== "string" || data.database === undefined) {
      return { result: "not-a-server" };
    }

    if (response.status === 503) return { result: "database-down", url };
    return response.ok ? { result: "ok", url } : { result: "not-a-server" };
  } catch {
    // Wrong host, server down, wrong network, CORS, or cleartext blocked by
    // the WebView - fetch reports all of them as the same opaque failure.
    return { result: "unreachable" };
  }
}

/**
 * Saves the address and restarts the app.
 *
 * The reload is the point rather than laziness. A token belongs to one server,
 * and so do the socket singleton, the chat history and the notification list.
 * Tearing those down one by one is a list nobody can keep complete as the app
 * grows; dropping the whole JS context cannot leave something still talking to
 * the old host.
 */
export function switchServer(url: string) {
  try {
    localStorage.setItem(STORAGE_KEY, url);
    localStorage.removeItem("token");
  } catch {
    // Nothing useful to do: the reload below will land back on the setup
    // screen, which is the correct outcome for storage we cannot write.
  }
  window.location.replace("/");
}
