let redirecting = false;

/**
 * Sesión vencida o inválida: limpia el token y manda al login. El guard evita
 * que varias respuestas 401 simultáneas disparen N redirecciones.
 */
export function expireSession() {
  if (redirecting) return;
  redirecting = true;
  localStorage.removeItem("token");
  window.location.replace("/");
}
