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

export type SessionEmployee = {
  id: number;
  employeeNumber: number;
  name: string;
  email?: string;
  role?: "EMPLOYEE" | "ADMIN";
};

/** Contexto que reciben las páginas anidadas vía useOutletContext(). */
export type AppOutletContext = {
  me: SessionEmployee | null;
};

const links = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/tareas", label: "Tareas" },
];

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
                  {link.label}
                </Button>
              );
            })}
          </Stack>

          <NotificationBell />

          <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
            {me?.name} · #{me?.employeeNumber}
          </Typography>

          <Button color="inherit" startIcon={<LogoutRounded />} onClick={logout}>
            Salir
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
