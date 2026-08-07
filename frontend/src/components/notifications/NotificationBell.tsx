import { NotificationsActiveRounded, NotificationsNoneRounded } from "@mui/icons-material";
import {
  Badge,
  Box,
  Button,
  Divider,
  IconButton,
  Popover,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { Fragment, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatClock, relativeDay } from "../tasks/datetime";
import { NOTIFICATION_META, type AppNotification } from "./types";
import { useNotifications } from "./useNotifications";

export default function NotificationBell() {
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  const navigate = useNavigate();
  const { items, unread, hasMore, loading, loadMore, markRead, markAllRead } = useNotifications();

  function handleClick(notification: AppNotification) {
    setAnchor(null);
    if (!notification.readAt) void markRead(notification.id);
    if (notification.taskId) navigate(`/tareas?task=${notification.taskId}`);
  }

  let lastDay = "";

  return (
    <>
      <Tooltip title="Notificaciones">
        <IconButton
          onClick={(event) => setAnchor(event.currentTarget)}
          aria-haspopup="dialog"
          aria-expanded={Boolean(anchor)}
          aria-label={unread ? `Notificaciones, ${unread} sin leer` : "Notificaciones"}
        >
          <Badge
            badgeContent={unread}
            max={99}
            slotProps={{ badge: { "aria-hidden": true } as never }}
            sx={{ "& .MuiBadge-badge": { bgcolor: "#b23c4a", color: "#fff", fontWeight: 700 } }}
          >
            {unread ? (
              <NotificationsActiveRounded sx={{ color: "#5b5ce2" }} />
            ) : (
              <NotificationsNoneRounded />
            )}
          </Badge>
        </IconButton>
      </Tooltip>

      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          paper: {
            sx: {
              width: 380,
              maxHeight: 480,
              borderRadius: "18px",
              overflow: "hidden",
              boxShadow: "0 24px 80px rgba(36,38,84,.14)",
            },
          },
        }}
      >
        <Stack
          direction="row"
          sx={{
            alignItems: "center",
            px: 1.75,
            py: 1.5,
            bgcolor: "#f7f8fc",
            borderBottom: "1px solid #e8e9f1",
          }}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 700, flex: 1 }}>
            Notificaciones
          </Typography>
          <Button size="small" disabled={unread === 0} onClick={() => void markAllRead()} autoFocus>
            Marcar todo como leído
          </Button>
        </Stack>

        <Box sx={{ overflowY: "auto", maxHeight: 400 }} role="list">
          {loading && (
            <Typography variant="body2" color="text.disabled" sx={{ p: 3, textAlign: "center" }}>
              Cargando…
            </Typography>
          )}

          {!loading && items.length === 0 && (
            <Stack sx={{ alignItems: "center", gap: 1, py: 5, color: "#9296ab" }}>
              <NotificationsNoneRounded sx={{ fontSize: 30 }} />
              <Typography variant="body2">No tenés notificaciones</Typography>
            </Stack>
          )}

          {items.map((notification) => {
            const meta = NOTIFICATION_META[notification.type];
            const day = relativeDay(notification.createdAt);
            const showDay = day !== lastDay;
            lastDay = day;

            return (
              <Fragment key={notification.id}>
                {showDay && (
                  <Box
                    className="chat-section-title"
                    sx={{ position: "sticky", top: 0, zIndex: 1, bgcolor: "#fff" }}
                  >
                    {day}
                  </Box>
                )}

                <Box
                  component="button"
                  role="listitem"
                  onClick={() => handleClick(notification)}
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "34px 1fr auto",
                    gap: 1.25,
                    alignItems: "start",
                    width: "100%",
                    textAlign: "left",
                    border: 0,
                    cursor: "pointer",
                    px: 1.75,
                    py: 1.5,
                    bgcolor: notification.readAt ? "#fff" : "#f6f5ff",
                    "&:hover": { bgcolor: "#f7f8fc" },
                  }}
                >
                  <Box
                    sx={{
                      width: 34,
                      height: 34,
                      borderRadius: "50%",
                      display: "grid",
                      placeItems: "center",
                      bgcolor: meta.soft,
                    }}
                  >
                    <meta.Icon sx={{ fontSize: 18, color: meta.accent }} />
                  </Box>

                  <Box sx={{ minWidth: 0 }}>
                    <Typography
                      variant="body2"
                      sx={{ fontWeight: notification.readAt ? 500 : 700 }}
                      noWrap
                    >
                      {notification.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" className="task-card-desc">
                      {notification.body}
                    </Typography>
                  </Box>

                  <Stack sx={{ alignItems: "flex-end", gap: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      {formatClock(notification.createdAt)}
                    </Typography>
                    {!notification.readAt && (
                      <Box sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: "#5b5ce2" }} />
                    )}
                  </Stack>
                </Box>
                <Divider />
              </Fragment>
            );
          })}

          {hasMore && (
            <Box sx={{ p: 1.5, textAlign: "center" }}>
              <Button size="small" onClick={() => void loadMore()}>
                Ver más
              </Button>
            </Box>
          )}
        </Box>
      </Popover>
    </>
  );
}
