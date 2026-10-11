import {
  AddRounded,
  CheckCircleRounded,
  DeleteOutlineRounded,
  DoneAllRounded,
  EditRounded,
  PushPinRounded,
  VisibilityRounded,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Paper,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useOutletContext } from "react-router-dom";
import { isStaff } from "../components/roles";
import type { AppOutletContext } from "../layouts/AppLayout";
import { t, tf } from "../i18n";
import { LOCALE } from "../locale";
import { useOnReconnect, useSocketEvent } from "../realtime/useSocketEvent";
import {
  PRIORITY_ORDER,
  createAnnouncement,
  deleteAnnouncement,
  listAnnouncementReaders,
  listAnnouncements,
  markAnnouncementRead,
  updateAnnouncement,
  type Announcement,
  type AnnouncementPayload,
  type AnnouncementPriority,
  type AnnouncementReader,
} from "../components/announcements/announcementsApi";
import { PRIORITY_META } from "../components/announcements/priority";

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString(LOCALE, { dateStyle: "medium", timeStyle: "short" });

type Filter = "ALL" | "UNREAD" | AnnouncementPriority;

/**
 * The landing tab: news and important notices for the team, most important
 * first. Everyone reads and marks as read; staff publishes and follows up on
 * who has not read a CRITICAL one yet.
 */
export default function AnnouncementsPage() {
  const { me } = useOutletContext<AppOutletContext>();
  const canPublish = isStaff(me?.role);

  const [items, setItems] = useState<Announcement[] | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [readersOf, setReadersOf] = useState<Announcement | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await listAnnouncements());
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useSocketEvent("announcements:changed", () => void load());
  useOnReconnect(() => void load());

  const visible = useMemo(() => {
    if (!items) return [];
    if (filter === "ALL") return items;
    if (filter === "UNREAD") return items.filter((item) => !item.readAt);
    return items.filter((item) => item.priority === filter);
  }, [items, filter]);

  const unread = items?.filter((item) => !item.readAt).length ?? 0;

  async function markRead(item: Announcement) {
    try {
      await markAnnouncementRead(item.id);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove(item: Announcement) {
    if (!window.confirm(tf("announcements.confirmDelete", { title: item.title }))) return;
    try {
      await deleteAnnouncement(item.id);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function submit(payload: AnnouncementPayload) {
    if (editing) await updateAnnouncement(editing.id, payload);
    else await createAnnouncement(payload);
    setFormOpen(false);
    await load();
  }

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      <Box className="page-heading">
        <Box>
          <Typography className="eyebrow">{t("announcements.eyebrow")}</Typography>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            {t("announcements.title")}
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            {t("announcements.subtitle")}
          </Typography>
        </Box>
        {canPublish && (
          <Button
            variant="contained"
            size="large"
            startIcon={<AddRounded />}
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            {t("announcements.new")}
          </Button>
        )}
      </Box>

      <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap", mt: 3 }}>
        <Chip
          label={t("announcements.filter.all")}
          color={filter === "ALL" ? "primary" : "default"}
          onClick={() => setFilter("ALL")}
        />
        <Chip
          label={tf("announcements.filter.unread", { count: unread })}
          color={filter === "UNREAD" ? "primary" : "default"}
          onClick={() => setFilter("UNREAD")}
        />
        {PRIORITY_ORDER.map((priority) => (
          <Chip
            key={priority}
            label={t(`announcements.priority.${priority}` as "announcements.priority.INFO")}
            color={filter === priority ? "primary" : "default"}
            onClick={() => setFilter(priority)}
          />
        ))}
      </Stack>

      <Stack spacing={2} sx={{ mt: 3, mb: 6 }}>
        {!items ? (
          <CircularProgress />
        ) : visible.length === 0 ? (
          <Paper className="status-card" elevation={0} sx={{ p: 4, textAlign: "center" }}>
            <Typography color="text.secondary">{t("announcements.empty")}</Typography>
          </Paper>
        ) : (
          visible.map((item) => (
            <AnnouncementCard
              key={item.id}
              item={item}
              canManage={canPublish}
              onRead={() => void markRead(item)}
              onEdit={() => {
                setEditing(item);
                setFormOpen(true);
              }}
              onDelete={() => void remove(item)}
              onReaders={() => setReadersOf(item)}
            />
          ))
        )}
      </Stack>

      <AnnouncementForm
        open={formOpen}
        initial={editing}
        onClose={() => setFormOpen(false)}
        onSubmit={submit}
      />
      <ReadersDialog announcement={readersOf} onClose={() => setReadersOf(null)} />
    </Container>
  );
}

function AnnouncementCard({
  item,
  canManage,
  onRead,
  onEdit,
  onDelete,
  onReaders,
}: {
  item: Announcement;
  canManage: boolean;
  onRead: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReaders: () => void;
}) {
  const meta = PRIORITY_META[item.priority];
  const critical = item.priority === "CRITICAL";
  const percent = item.teamCount ? Math.round((item.readCount / item.teamCount) * 100) : 0;

  return (
    <Paper
      elevation={0}
      className={`announcement-card ${item.readAt ? "" : "unread"}`}
      style={{ "--priority": meta.color } as CSSProperties}
    >
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "flex-start" }}>
        <Box className="announcement-icon">
          <meta.Icon />
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" sx={{ alignItems: "center", gap: 1, flexWrap: "wrap" }}>
            <Chip
              size="small"
              className="announcement-priority"
              label={t(`announcements.priority.${item.priority}` as "announcements.priority.INFO")}
            />
            {item.pinned && (
              <Tooltip title={t("announcements.pinned")}>
                <PushPinRounded sx={{ fontSize: 18, color: "var(--muted)" }} />
              </Tooltip>
            )}
            {!item.readAt && <Chip size="small" color="primary" label={t("announcements.new.badge")} />}
            <Box sx={{ flex: 1 }} />
            {canManage && (
              <Stack direction="row">
                <Tooltip title={t("announcements.edit")}>
                  <IconButton size="small" onClick={onEdit} aria-label={t("announcements.edit")}>
                    <EditRounded fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title={t("announcements.delete")}>
                  <IconButton size="small" onClick={onDelete} aria-label={t("announcements.delete")}>
                    <DeleteOutlineRounded fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            )}
          </Stack>

          <Typography variant="h6" sx={{ fontWeight: 750, mt: 1 }}>
            {item.title}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {tf("announcements.byline", { name: item.authorName, date: formatDateTime(item.createdAt) })}
          </Typography>
          <Typography sx={{ mt: 1.5, whiteSpace: "pre-wrap", lineHeight: 1.65 }}>{item.body}</Typography>

          {/* Everyone sees how far a CRITICAL one has reached; staff can open
              the list of who has not read it. */}
          {(critical || canManage) && (
            <Box className="announcement-reach">
              {item.readByAll ? (
                <Stack direction="row" spacing={1} sx={{ alignItems: "center", color: "var(--success)" }}>
                  <DoneAllRounded fontSize="small" />
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {t("announcements.readByAll")}
                  </Typography>
                </Stack>
              ) : (
                <>
                  <Typography variant="body2" color="text.secondary">
                    {tf("announcements.readBy", { count: item.readCount, total: item.teamCount })}
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={percent}
                    sx={{ mt: 0.75, height: 6, borderRadius: 999 }}
                    color={critical ? "error" : "primary"}
                  />
                </>
              )}
            </Box>
          )}

          <Stack direction="row" spacing={1} sx={{ mt: 2, alignItems: "center", flexWrap: "wrap" }} useFlexGap>
            {item.readAt ? (
              <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", color: "text.secondary" }}>
                <CheckCircleRounded sx={{ fontSize: 18, color: "var(--success)" }} />
                <Typography variant="body2">
                  {tf("announcements.readAt", { date: formatDateTime(item.readAt) })}
                </Typography>
              </Stack>
            ) : (
              <Button
                variant={critical ? "contained" : "outlined"}
                color={critical ? "error" : "primary"}
                size="small"
                startIcon={<CheckCircleRounded />}
                onClick={onRead}
              >
                {critical ? t("announcements.ack") : t("announcements.markRead")}
              </Button>
            )}
            {canManage && (
              <Button size="small" color="inherit" startIcon={<VisibilityRounded />} onClick={onReaders}>
                {t("announcements.whoRead")}
              </Button>
            )}
          </Stack>
        </Box>
      </Stack>
    </Paper>
  );
}

function AnnouncementForm({
  open,
  initial,
  onClose,
  onSubmit,
}: {
  open: boolean;
  initial: Announcement | null;
  onClose: () => void;
  onSubmit: (payload: AnnouncementPayload) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<AnnouncementPriority>("INFO");
  const [pinned, setPinned] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(initial?.title ?? "");
    setBody(initial?.body ?? "");
    setPriority(initial?.priority ?? "INFO");
    setPinned(initial?.pinned ?? false);
    setError("");
  }, [open, initial]);

  async function submit() {
    setSaving(true);
    setError("");
    try {
      await onSubmit({ title: title.trim(), body: body.trim(), priority, pinned });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{initial ? t("announcements.editTitle") : t("announcements.newTitle")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label={t("announcements.field.title")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            slotProps={{ htmlInput: { maxLength: 160 } }}
          />
          <TextField
            select
            label={t("announcements.field.priority")}
            value={priority}
            onChange={(e) => setPriority(e.target.value as AnnouncementPriority)}
            helperText={t(`announcements.priorityHelp.${priority}` as "announcements.priorityHelp.INFO")}
          >
            {PRIORITY_ORDER.map((value) => {
              const { Icon, color } = PRIORITY_META[value];
              return (
                <MenuItem key={value} value={value}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <Icon fontSize="small" sx={{ color }} />
                    <span>{t(`announcements.priority.${value}` as "announcements.priority.INFO")}</span>
                  </Stack>
                </MenuItem>
              );
            })}
          </TextField>
          <TextField
            label={t("announcements.field.body")}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            multiline
            minRows={5}
            slotProps={{ htmlInput: { maxLength: 5000 } }}
          />
          <FormControlLabel
            control={<Switch checked={pinned} onChange={(e) => setPinned(e.target.checked)} />}
            label={t("announcements.field.pinned")}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("warnings.cancel")}</Button>
        <Button
          variant="contained"
          onClick={() => void submit()}
          disabled={saving || !title.trim() || !body.trim()}
        >
          {initial ? t("announcements.save") : t("announcements.publish")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function ReadersDialog({
  announcement,
  onClose,
}: {
  announcement: Announcement | null;
  onClose: () => void;
}) {
  const [readers, setReaders] = useState<AnnouncementReader[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!announcement) return;
    setReaders(null);
    setError("");
    listAnnouncementReaders(announcement.id)
      .then(setReaders)
      .catch((err: Error) => setError(err.message));
  }, [announcement]);

  // Who still has to read it goes first: that is the list somebody acts on.
  const sorted = readers
    ? [...readers].sort((a, b) => Number(Boolean(a.readAt)) - Number(Boolean(b.readAt)))
    : null;

  return (
    <Dialog open={announcement !== null} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t("announcements.whoRead")}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error">{error}</Alert>}
        {!sorted ? (
          <CircularProgress />
        ) : (
          <List dense>
            {sorted.map(({ employee, readAt }) => (
              <ListItem key={employee.id} disableGutters>
                <ListItemText
                  primary={`${employee.name} · #${employee.employeeNumber}`}
                  secondary={
                    readAt
                      ? tf("announcements.readAt", { date: formatDateTime(readAt) })
                      : t("announcements.notRead")
                  }
                  slotProps={{
                    secondary: { sx: { color: readAt ? "var(--success)" : "var(--danger)" } },
                  }}
                />
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("announcements.close")}</Button>
      </DialogActions>
    </Dialog>
  );
}
