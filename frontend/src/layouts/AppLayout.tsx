import {
  AccessTimeRounded,
  CalendarMonthRounded,
  CampaignRounded,
  DashboardRounded,
  DownloadRounded,
  FolderRounded,
  GavelRounded,
  HowToRegRounded,
  InsightsRounded,
  LogoutRounded,
  ManageAccountsRounded,
  MenuRounded,
} from "@mui/icons-material";
import type { SvgIconComponent } from "@mui/icons-material";
import {
  AppBar,
  Badge,
  Box,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  Toolbar,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { Link as RouterLink, Outlet, useLocation } from "react-router-dom";
import { api } from "../api";
import SocketProvider from "../realtime/SocketProvider";
import { closeSocket } from "../realtime/socket";
import NotificationBell from "../components/notifications/NotificationBell";
import ChatProvider from "../components/chat/ChatProvider";
import ChatLauncher from "../components/chat/ChatLauncher";
import ActivityConfirmationDialog from "../components/activities/ActivityConfirmationDialog";
import { isAdminRole, type Role } from "../components/roles";
import ShellWatchers, { type NavBadges } from "../components/announcements/ShellWatchers";
import AppSettings from "../components/AppSettings";
import { t } from "../i18n";
import { installAttention } from "../alerts/attention";
import { ProjectsProvider, useProjects } from "../components/projects/ProjectsContext";

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
  // First, and where the app opens: news and notices for the whole team.
  { to: "/announcements", key: "nav.announcements", Icon: CampaignRounded },
  { to: "/dashboard", key: "nav.dashboard", Icon: DashboardRounded },
  // No role filter: the summary is always the authenticated employee's own.
  { to: "/summary", key: "nav.summary", Icon: InsightsRounded },
  { to: "/workday", key: "nav.workday", Icon: CalendarMonthRounded },
  // No role filter either: an admin gets the team there, anyone else their own.
  { to: "/attendance", key: "nav.attendance", Icon: HowToRegRounded },
  // Same split: an admin sees and grants the team's, anyone else their own.
  { to: "/warnings", key: "nav.warnings", Icon: GavelRounded },
  // Everyone downloads; admins get the edit controls on the page.
  { to: "/downloads", key: "nav.downloads", Icon: DownloadRounded },
  // Admins only: sign-ups, password resets and every account's lifecycle.
  { to: "/accounts", key: "nav.accounts", Icon: ManageAccountsRounded, adminOnly: true },
] as const satisfies readonly {
  to: string;
  key: string;
  Icon: SvgIconComponent;
  adminOnly?: boolean;
}[];

const NAV_ITEM_SX = {
  borderRadius: "12px",
  mb: 0.5,
  transition: "background-color .15s ease, color .15s ease",
  "&.Mui-selected, &.Mui-selected:hover": {
    bgcolor: "var(--accent-soft)",
    color: "var(--accent)",
    boxShadow: "inset 3px 0 0 0 var(--accent)",
  },
} as const;

/** Width of the sidebar from md up. */
const SIDEBAR_WIDTH = 232;

/**
 * The page links plus logout, shared by the permanent sidebar (md and up) and
 * the phone drawer, so the two can never list different pages.
 */
function NavList({
  pathname,
  onLogout,
  badges,
  isAdmin,
}: {
  pathname: string;
  onLogout: () => void;
  isAdmin: boolean;
  /** Counter per link path: unread announcements, warnings awaiting a decision. */
  badges: NavBadges;
}) {
  const { projects } = useProjects();

  return (
    <List sx={{ px: 1.5, py: 1.5 }}>
      {links.filter((link) => isAdmin || !("adminOnly" in link)).map(({ to, key, Icon }) => {
        const active = pathname.startsWith(to);
        return (
          <ListItemButton
            key={to}
            component={RouterLink}
            to={to}
            selected={active}
            sx={NAV_ITEM_SX}
          >
            <ListItemIcon sx={{ minWidth: 38, color: active ? "var(--accent)" : "inherit" }}>
              <Icon fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primary={t(key)}
              slotProps={{ primary: { sx: { fontWeight: active ? 700 : 500 } } }}
            />
            {Boolean(badges[to]) && (
              <Badge
                badgeContent={badges[to]}
                max={99}
                sx={{
                  mr: 1.5,
                  "& .MuiBadge-badge": { bgcolor: "var(--danger)", color: "#fff", fontWeight: 700 },
                }}
              />
            )}
          </ListItemButton>
        );
      })}

      {/* One entry per project an admin created on the dashboard; its tools
          (tasks, maps, patch notes, GDD) are tabs inside. */}
      {projects && projects.length > 0 && (
        <>
          <ListSubheader
            disableSticky
            sx={{ bgcolor: "transparent", lineHeight: "32px", mt: 1, fontWeight: 700 }}
          >
            {t("nav.projects")}
          </ListSubheader>
          {projects.map((project) => {
            const to = `/projects/${project.id}`;
            const active = pathname === to || pathname.startsWith(`${to}/`);
            return (
              <ListItemButton
                key={project.id}
                component={RouterLink}
                to={`${to}/tasks`}
                selected={active}
                sx={NAV_ITEM_SX}
              >
                <ListItemIcon sx={{ minWidth: 38, color: active ? "var(--accent)" : "inherit" }}>
                  <FolderRounded fontSize="small" />
                </ListItemIcon>
                <ListItemText
                  primary={project.name}
                  slotProps={{
                    primary: { noWrap: true, sx: { fontWeight: active ? 700 : 500 } },
                  }}
                />
              </ListItemButton>
            );
          })}
        </>
      )}

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
  const [badges, setBadges] = useState<NavBadges>({});
  const handleBadges = useCallback((next: NavBadges) => setBadges(next), []);

  // Sound and desktop alerts unlock on the first click; see alerts/attention.ts.
  useEffect(() => installAttention(), []);

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
    <ProjectsProvider>
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
            Heroic Manager
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
            <Typography variant="h6">Heroic Manager</Typography>
            <Typography variant="body2" color="text.secondary">
              {me?.name} · #{me?.employeeNumber}
            </Typography>
          </Box>

          <Divider />

          <Box onClick={() => setNavOpen(false)}>
            <NavList pathname={pathname} onLogout={logout} badges={badges} isAdmin={isAdminRole(me?.role)} />
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
          <NavList pathname={pathname} onLogout={logout} badges={badges} isAdmin={isAdminRole(me?.role)} />
        </Box>

        <Box component="main" sx={{ flex: 1, minWidth: 0 }}>
          <Outlet context={{ me } satisfies AppOutletContext} />
          {me && <ShellWatchers isAdmin={isAdminRole(me.role)} onBadges={handleBadges} />}
        </Box>
      </Box>

      <ChatLauncher me={me ? { id: me.id, name: me.name } : null} />

      {/* Here and not on the dashboard: the check has to be answerable from
          whatever page the person is on, or it disconnects them unasked. */}
      <ActivityConfirmationDialog me={me} />
    </Box>
    </ChatProvider>
    </ProjectsProvider>
    </SocketProvider>
  );
}
