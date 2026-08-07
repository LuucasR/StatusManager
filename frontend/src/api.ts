import { expireSession } from "./session";

export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(localStorage.getItem("token") ? { Authorization: `Bearer ${localStorage.getItem("token")}` } : {}),
      ...init?.headers,
    },
  });

  // Interceptor central de sesión vencida. Antes cada página lo resolvía a mano
  // con un regex sobre el mensaje en español, que es frágil; el chat y la
  // campana hacen muchas más requests y no pueden depender de eso.
  if (response.status === 401) {
    expireSession();
    throw new Error("Sesión inválida o vencida");
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message ?? "No se pudo completar la operación");
  return data;
}
