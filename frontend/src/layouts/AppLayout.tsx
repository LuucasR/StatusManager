import { AccessTimeRounded, LogoutRounded, MenuRounded } from "@mui/icons-material";
import {
  AppBar,
  Box,
  Button,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  Toolbar,
  Typography,
} from "@mui/material";
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
  // No role filter either: an admin gets the team there, anyone else their own.
  { to: "/attendance", key: "nav.attendance" },
] as const;

// The calendar is readable by the whole team - everyone works to these hours -
// and only editable by an admin, which the page and the backend both enforce.

export default function AppLayout() {
  const { pathname } = useLocation();
  const [me, setMe] = useState<SessionEmployee | null>(null);
  const [navOpen, setNavOpen] = useState(false);

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
      {/* The inset padding is for the app: the Android WebView draws edge to
          edge, so without it the toolbar sits underneath the clock. */}
      <AppBar
        color="inherit"
        elevation={0}
        position="sticky"
        sx={{ pt: "env(safe-area-inset-top, 0px)" }}
      >
        <Toolbar>
          {/* Below md the four nav buttons, the name and the logout label
              cannot share a phone-width row - they used to squash into an
              unreadable smear - so they move into a drawer and only the icon
              controls stay on the bar. */}
          <IconButton
            color="inherit"
            edge="start"
            onClick={() => setNavOpen(true)}
            aria-label={t("nav.menu")}
            sx={{ display: { xs: "inline-flex", md: "none" }, mr: 1 }}
          >
            <MenuRounded />
          </IconButton>

          <Box className="brand-mark small" sx={{ display: { xs: "none", sm: "grid" } }}>
            <AccessTimeRounded />
          </Box>

          <Typography variant="h6" noWrap>
            Status Manager
          </Typography>

          <Stack
            direction="row"
            spacing={1}
            sx={{ flex: 1, ml: 3, display: { xs: "none", md: "flex" } }}
          >
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

          {/* Pushes the icon cluster right once the nav row above is hidden. */}
          <Box sx={{ flex: 1, display: { xs: "block", md: "none" } }} />

          <AppSettings />

          <NotificationBell />

          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ ml: 1, display: { xs: "none", lg: "block" } }}
          >
            {me?.name} · #{me?.employeeNumber}
          </Typography>

          <Button
            color="inherit"
            startIcon={<LogoutRounded />}
            onClick={logout}
            sx={{ display: { xs: "none", md: "inline-flex" } }}
          >
            {t("nav.logout")}
          </Button>
        </Toolbar>
      </AppBar>

      <Drawer
        open={navOpen}
        onClose={() => setNavOpen(false)}
        sx={{ display: { xs: "block", md: "none" } }}
      >
        <Box sx={{ width: 260, pt: "env(safe-area-inset-top, 0px)" }} role="presentation">
          <Box sx={{ px: 2, py: 2 }}>
            <Typography variant="h6">Status Manager</Typography>
            <Typography variant="body2" color="text.secondary">
              {me?.name} · #{me?.employeeNumber}
            </Typography>
          </Box>

          <Divider />

          <List onClick={() => setNavOpen(false)}>
            {links.map((link) => (
              <ListItemButton
                key={link.to}
                component={RouterLink}
                to={link.to}
                selected={pathname.startsWith(link.to)}
              >
                <ListItemText primary={t(link.key)} />
              </ListItemButton>
            ))}

            <Divider sx={{ my: 1 }} />

            <ListItemButton onClick={logout}>
              <ListItemText primary={t("nav.logout")} />
            </ListItemButton>
          </List>
        </Box>
      </Drawer>

      <Outlet context={{ me } satisfies AppOutletContext} />

      <ChatLauncher me={me ? { id: me.id, name: me.name } : null} />
    </Box>
    </ChatProvider>
    </SocketProvider>
  );
}
