let redirecting = false;

/**
 * Expired or invalid session: clears the token and sends the user to the login
 * screen. The guard stops several simultaneous 401s from firing N redirects.
 */
export function expireSession() {
  if (redirecting) return;
  redirecting = true;
  localStorage.removeItem("token");
  window.location.replace("/");
}

/**
 * The token is valid but the account still owes a password change, so every
 * endpoint except /auth/change-password refuses it. Keeps the token (it is what
 * authorises the change) and parks the user on the change screen.
 *
 * Shares the guard with expireSession: whichever lands first wins, and a burst
 * of parallel requests cannot queue up several redirects.
 */
export function requirePasswordChange() {
  if (redirecting) return;
  if (window.location.pathname === "/change-password") return;
  redirecting = true;
  window.location.replace("/change-password");
}
