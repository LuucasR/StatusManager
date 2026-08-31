import { AccessTimeRounded, LogoutRounded } from "@mui/icons-material";
import { AppBar, Box, Button, Stack, Toolbar, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { Link as RouterLink, Outlet, useLocation } from "react-router-dom";
import { api } from "../api";
import SocketProvider from "../realtime/SocketProvider";
import { closeSocket } from "../realtime/socket";
import NotificationBell from "../components/notifications/NotificationBell";
import ChatProvider from "../components/chat/ChatProvider";
import ChatLauncher from "../components/chat/ChatLauncher";
import type { Role } from "../components/roles";
import AppSettings from "../components/AppSettings";
import { t } from "../i18n";

export type SessionEmployee = {
  id: number;
  employeeNumber: number;
  name: string;
  email?: string;
  role?: Role;
};

/** Context the nested pages receive through useOutletContext(). */
export type AppOutletContext = {
  me: SessionEmployee | null;
};

// Labels resolve through t() at render time, so the language switch relabels
// the nav without any extra wiring.
const links = [
  { to: "/dashboard", key: "nav.dashboard" },
  { to: "/tasks", key: "nav.tasks" },
  // No role filter: the summary is always the authenticated employee's own.
  { to: "/summary", key: "nav.summary" },
  { to: "/workday", key: "nav.workday" },
] as const;

// The calendar is readable by the whole team - everyone works to these hours -
// and only editable by an admin, which the page and the backend both enforce.

export default function AppLayout() {
  const { pathname } = useLocation();
  const [me, setMe] = useState<SessionEmployee | null>(null);

  useEffect(() => {
    api<SessionEmployee>("/activities/me")
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  function logout() {
    closeSocket();
    localStorage.removeItem("token");
    window.location.replace("/");
  }

  return (
    <SocketProvider>
    <ChatProvider>
    <Box>
      <AppBar color="inherit" elevation={0} position="sticky">
        <Toolbar>
          <Box className="brand-mark small">
            <AccessTimeRounded />
          </Box>

          <Typography variant="h6">Status Manager</Typography>

          <Stack direction="row" spacing={1} sx={{ flex: 1, ml: 3 }}>
            {links.map((link) => {
              const active = pathname.startsWith(link.to);
              return (
                <Button
                  key={link.to}
                  component={RouterLink}
                  to={link.to}
                  color={active ? "primary" : "inherit"}
                  sx={{ fontWeight: active ? 700 : 500 }}
                >
                  {t(link.key)}
                </Button>
              );
            })}
          </Stack>

          <AppSettings />

          <NotificationBell />

          <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
            {me?.name} · #{me?.employeeNumber}
          </Typography>

          <Button color="inherit" startIcon={<LogoutRounded />} onClick={logout}>
            {t("nav.logout")}
          </Button>
        </Toolbar>
      </AppBar>

      <Outlet context={{ me } satisfies AppOutletContext} />

      <ChatLauncher me={me ? { id: me.id, name: me.name } : null} />
    </Box>
    </ChatProvider>
    </SocketProvider>
  );
}
