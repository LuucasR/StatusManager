import {
  AccessTimeRounded,
  CalendarMonthRounded,
  DashboardRounded,
  DescriptionRounded,
  DownloadRounded,
  GavelRounded,
  HowToRegRounded,
  InsightsRounded,
  LogoutRounded,
  MenuRounded,
  ViewKanbanRounded,
} from "@mui/icons-material";
import type { SvgIconComponent } from "@mui/icons-material";
import {
  AppBar,
  Box,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
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
import ActivityConfirmationDialog from "../components/activities/ActivityConfirmationDialog";
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
  { to: "/dashboard", key: "nav.dashboard", Icon: DashboardRounded },
  { to: "/tasks", key: "nav.tasks", Icon: ViewKanbanRounded },
  // No role filter: the summary is always the authenticated employee's own.
  { to: "/summary", key: "nav.summary", Icon: InsightsRounded },
  { to: "/workday", key: "nav.workday", Icon: CalendarMonthRounded },
  // No role filter either: an admin gets the team there, anyone else their own.
  { to: "/attendance", key: "nav.attendance", Icon: HowToRegRounded },
  // Same split: an admin sees and grants the team's, anyone else their own.
  { to: "/warnings", key: "nav.warnings", Icon: GavelRounded },
  // Everyone writes their own section; staff gets the review panel on the page.
  { to: "/patch-notes", key: "nav.patchNotes", Icon: DescriptionRounded },
  // Everyone downloads; admins get the edit controls on the page.
  { to: "/downloads", key: "nav.downloads", Icon: DownloadRounded },
] as const satisfies readonly { to: string; key: string; Icon: SvgIconComponent }[];

/** Width of the sidebar from md up. */
const SIDEBAR_WIDTH = 232;

/**
 * The page links plus logout, shared by the permanent sidebar (md and up) and
 * the phone drawer, so the two can never list different pages.
 */
function NavList({ pathname, onLogout }: { pathname: string; onLogout: () => void }) {
  return (
    <List sx={{ px: 1.5, py: 1.5 }}>
      {links.map(({ to, key, Icon }) => {
        const active = pathname.startsWith(to);
        return (
          <ListItemButton
            key={to}
            component={RouterLink}
            to={to}
            selected={active}
            sx={{
              borderRadius: "12px",
              mb: 0.5,
              "&.Mui-selected, &.Mui-selected:hover": {
                bgcolor: "color-mix(in srgb, var(--accent) 12%, transparent)",
                color: "var(--accent)",
              },
            }}
          >
            <ListItemIcon sx={{ minWidth: 38, color: active ? "var(--accent)" : "inherit" }}>
              <Icon fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primary={t(key)}
              slotProps={{ primary: { sx: { fontWeight: active ? 700 : 500 } } }}
            />
          </ListItemButton>
        );
      })}

      <Divider sx={{ my: 1 }} />

      <ListItemButton onClick={onLogout} sx={{ borderRadius: "12px" }}>
        <ListItemIcon sx={{ minWidth: 38, color: "inherit" }}>
          <LogoutRounded fontSize="small" />
        </ListItemIcon>
        <ListItemText primary={t("nav.logout")} />
      </ListItemButton>
    </List>
  );
}

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
          {/* The pages live in the left sidebar from md up; below that it
              would eat the screen, so it becomes a drawer behind this. */}
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

          <Box sx={{ flex: 1 }} />

          <AppSettings />

          <NotificationBell />

          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ ml: 1, display: { xs: "none", lg: "block" } }}
          >
            {me?.name} · #{me?.employeeNumber}
          </Typography>

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

          <Box onClick={() => setNavOpen(false)}>
            <NavList pathname={pathname} onLogout={logout} />
          </Box>
        </Box>
      </Drawer>

      <Box sx={{ display: "flex", alignItems: "flex-start" }}>
        {/* Sticky under the AppBar (64px on desktop) rather than a fixed
            Drawer, so the page column needs no offset of its own. */}
        <Box
          component="nav"
          aria-label={t("nav.menu")}
          sx={{
            display: { xs: "none", md: "block" },
            width: SIDEBAR_WIDTH,
            flexShrink: 0,
            position: "sticky",
            top: 64,
            height: "calc(100vh - 64px)",
            overflowY: "auto",
            borderRight: 1,
            borderColor: "divider",
          }}
        >
          <NavList pathname={pathname} onLogout={logout} />
        </Box>

        <Box component="main" sx={{ flex: 1, minWidth: 0 }}>
          <Outlet context={{ me } satisfies AppOutletContext} />
        </Box>
      </Box>

      <ChatLauncher me={me ? { id: me.id, name: me.name } : null} />

      {/* Here and not on the dashboard: the check has to be answerable from
          whatever page the person is on, or it disconnects them unasked. */}
      <ActivityConfirmationDialog me={me} />
    </Box>
    </ChatProvider>
    </SocketProvider>
  );
}
