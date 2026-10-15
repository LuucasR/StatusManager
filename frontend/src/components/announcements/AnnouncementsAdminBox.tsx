import { EditRounded, ExpandMoreRounded, SearchRounded } from "@mui/icons-material";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Chip,
  CircularProgress,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { t, tf } from "../../i18n";
import { LOCALE } from "../../locale";
import { useOnReconnect, useSocketEvent } from "../../realtime/useSocketEvent";
import { PRIORITY_META } from "./priority";
import { listAdminAnnouncements, type AdminAnnouncement } from "./announcementsApi";

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString(LOCALE, { dateStyle: "medium", timeStyle: "short" });

/**
 * The admins' box: every announcement ever published - expired ones too, which
 * have left everybody else's list - with who saw it and who has not, and a
 * search over title, message and author.
 */
export default function AnnouncementsAdminBox({ onEdit }: { onEdit: (item: AdminAnnouncement) => void }) {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<AdminAnnouncement[] | null>(null);
  const [error, setError] = useState("");

  // One request per pause in typing, not per key.
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const load = useCallback(async () => {
    try {
      setItems(await listAdminAnnouncements(search));
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  }, [search]);

  useEffect(() => {
    void load();
  }, [load]);
  useSocketEvent("announcements:changed", () => void load());
  useOnReconnect(() => void load());

  return (
    <Paper className="status-card" elevation={0} sx={{ p: { xs: 2, md: 3 }, mb: 6 }}>
      <Typography variant="h6" sx={{ fontWeight: 800 }}>
        {t("announcementsAdmin.title")}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
        {t("announcementsAdmin.subtitle")}
      </Typography>

      <TextField
        size="small"
        fullWidth
        placeholder={t("announcementsAdmin.search")}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        sx={{ mt: 2 }}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchRounded fontSize="small" />
              </InputAdornment>
            ),
          },
        }}
      />

      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}

      <Box sx={{ mt: 2 }}>
        {!items ? (
          <CircularProgress size={24} />
        ) : items.length === 0 ? (
          <Typography color="text.secondary">{t("announcementsAdmin.empty")}</Typography>
        ) : (
          items.map((item) => {
            const total = item.seen.length + item.pending.length;
            const meta = PRIORITY_META[item.priority];
            return (
              <Accordion key={item.id} disableGutters elevation={0} sx={{ border: "1px solid var(--border)", mb: 1, "&:before": { display: "none" } }}>
                <AccordionSummary expandIcon={<ExpandMoreRounded />}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.5, minWidth: 0, flex: 1 }}>
                    <meta.Icon fontSize="small" sx={{ color: meta.color }} />
                    <Typography sx={{ fontWeight: 700, overflowWrap: "anywhere", minWidth: 0 }}>
                      {item.title}
                    </Typography>
                    <Chip
                      size="small"
                      color={item.expired ? "default" : "success"}
                      variant={item.expired ? "outlined" : "filled"}
                      label={item.expired ? t("announcementsAdmin.expired") : t("announcementsAdmin.active")}
                    />
                    <Chip
                      size="small"
                      variant="outlined"
                      label={tf("announcementsAdmin.seenCount", { seen: item.seen.length, total })}
                    />
                  </Stack>
                </AccordionSummary>
                <AccordionDetails>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
                    <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                      {tf("announcementsAdmin.meta", {
                        author: item.authorName,
                        date: formatDateTime(item.createdAt),
                      })}
                      {item.expiresAt &&
                        ` · ${tf(item.expired ? "announcementsAdmin.expiredOn" : "announcementsAdmin.expiresOn", {
                          date: formatDateTime(item.expiresAt),
                        })}`}
                    </Typography>
                    <Tooltip title={t("common.edit")}>
                      <IconButton size="small" onClick={() => onEdit(item)}>
                        <EditRounded fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                  <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", mt: 1, overflowWrap: "anywhere" }}>
                    {item.body}
                  </Typography>

                  <Box
                    sx={{
                      display: "grid",
                      gap: 2,
                      mt: 2,
                      gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))" },
                    }}
                  >
                    <Box>
                      <Typography variant="overline" color="success.main">
                        {tf("announcementsAdmin.seen", { count: item.seen.length })}
                      </Typography>
                      {item.seen.length === 0 && (
                        <Typography variant="body2" color="text.secondary">—</Typography>
                      )}
                      {item.seen.map(({ employee, readAt }) => (
                        <Typography key={employee.id} variant="body2">
                          {employee.name}{" "}
                          <Typography component="span" variant="caption" color="text.secondary">
                            {formatDateTime(readAt)}
                          </Typography>
                        </Typography>
                      ))}
                    </Box>
                    <Box>
                      <Typography variant="overline" color="warning.main">
                        {tf("announcementsAdmin.pending", { count: item.pending.length })}
                      </Typography>
                      {item.pending.length === 0 && (
                        <Typography variant="body2" color="text.secondary">—</Typography>
                      )}
                      {item.pending.map((employee) => (
                        <Typography key={employee.id} variant="body2">
                          {employee.name}
                        </Typography>
                      ))}
                    </Box>
                  </Box>
                </AccordionDetails>
              </Accordion>
            );
          })
        )}
      </Box>
    </Paper>
  );
}
