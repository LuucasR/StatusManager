import { expireSession, requirePasswordChange } from "./session";
import { t, tryT } from "./i18n";

/**
 * Vite inlines VITE_* at BUILD time, not at runtime. A production build made
 * without the variable used to fall back to localhost silently: the bundle
 * shipped, the build passed, and every request failed in the browser with no
 * hint as to why. Failing here makes that misconfiguration obvious instead.
 */
function resolveApiUrl() {
  const configured = import.meta.env.VITE_API_URL;
  if (configured) return configured;
  if (import.meta.env.PROD) {
    throw new Error(
      "VITE_API_URL is missing. It has to be set when the frontend is built, " +
        "otherwise the app points at localhost and nothing works."
    );
  }
  return "http://localhost:3000";
}

export const API_URL = resolveApiUrl();

/** Carries the backend `code` so callers can branch on it without matching text. */
export class ApiError extends Error {
  // Declared as a field rather than a constructor parameter property: this
  // project builds with erasableSyntaxOnly, which forbids the shorthand.
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

/**
 * Turns a backend error into text in the active language.
 *
 * Every backend response carries a stable `code`, and the catalogue is keyed by
 * it — so the server can reword a message without the UI noticing, and the UI
 * can speak Spanish while the server only speaks English.
 *
 * Validation codes deliberately have NO catalogue entry: their `message` is
 * field-specific ("The end date must be after the start date") and a generic
 * translated line would be less useful than the untranslated detail.
 */
function localizeError(code: unknown, message: unknown): string {
  const fromCatalogue = typeof code === "string" ? tryT(`error.${code}`) : undefined;
  if (fromCatalogue) return fromCatalogue;
  if (typeof message === "string" && message) return message;
  return t("error.UNKNOWN");
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(localStorage.getItem("token") ? { Authorization: `Bearer ${localStorage.getItem("token")}` } : {}),
      ...init?.headers,
    },
  });

  const data = await response.json().catch(() => ({}));

  // Central expired-session interceptor. Each page used to handle this by hand
  // with a regex over the Spanish message, which is fragile; chat and the bell
  // make far more requests and cannot depend on that.
  if (response.status === 401) {
    expireSession();
    throw new ApiError(t("error.SESSION_EXPIRED"), "SESSION_EXPIRED");
  }

  // Matched on `code`, never on the message.
  if (response.status === 403 && data.code === "PASSWORD_CHANGE_REQUIRED") {
    requirePasswordChange();
    throw new ApiError(t("error.PASSWORD_CHANGE_REQUIRED"), data.code);
  }

  if (!response.ok) {
    throw new ApiError(localizeError(data.code, data.message), data.code);
  }

  return data;
}
