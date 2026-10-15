import { CheckCircleRounded, ReportRounded } from "@mui/icons-material";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { t, tf } from "../../i18n";
import { LOCALE } from "../../locale";
import { useOnReconnect, useSocketEvent } from "../../realtime/useSocketEvent";
import { getTeamWarnings, warningStatus } from "../warnings/warningsApi";
import { pendingAccountRequests } from "../admin/accountsApi";
import {
  listAnnouncements,
  markAnnouncementRead,
  type Announcement,
} from "./announcementsApi";

export type NavBadges = Partial<Record<string, number>>;

/**
 * App-wide listeners that need the socket, so they live inside the providers
 * AppLayout renders: the counters on the sidebar links, and the gate that puts
 * an unread CRITICAL announcement in front of everything until it is read.
 */
export default function ShellWatchers({
  isAdmin,
  onBadges,
}: {
  isAdmin: boolean;
  onBadges: (badges: NavBadges) => void;
}) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [pendingWarnings, setPendingWarnings] = useState(0);
  const [pendingAccounts, setPendingAccounts] = useState(0);
  const [acknowledging, setAcknowledging] = useState(false);

  const loadAnnouncements = useCallback(async () => {
    try {
      setAnnouncements(await listAnnouncements());
    } catch {
      // A counter is not worth an error banner; the page itself reports it.
    }
  }, []);

  const loadWarnings = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const { rows } = await getTeamWarnings();
      setPendingWarnings(rows.filter((row) => warningStatus(row) === "PENDING").length);
    } catch {
      // Same as above.
    }
  }, [isAdmin]);

  const loadAccounts = useCallback(async () => {
    if (!isAdmin) return;
    try {
      setPendingAccounts(await pendingAccountRequests());
    } catch {
      // Same as above.
    }
  }, [isAdmin]);

  useEffect(() => {
    void loadAnnouncements();
  }, [loadAnnouncements]);
  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);
  useEffect(() => {
    void loadWarnings();
  }, [loadWarnings]);

  useSocketEvent("announcements:changed", () => void loadAnnouncements());
  useSocketEvent("warnings:changed", () => void loadWarnings());
  useSocketEvent("accounts:changed", () => void loadAccounts());
  useOnReconnect(() => {
    void loadAnnouncements();
    void loadWarnings();
    void loadAccounts();
  });

  const unread = announcements.filter((item) => !item.readAt).length;

  useEffect(() => {
    onBadges({ "/announcements": unread, "/performance": pendingWarnings, "/accounts": pendingAccounts });
  }, [unread, pendingWarnings, pendingAccounts, onBadges]);

  // The oldest unread critical one first: they are acknowledged in order.
  const critical = [...announcements]
    .reverse()
    .find((item) => item.priority === "CRITICAL" && !item.readAt);

  async function acknowledge() {
    if (!critical) return;
    setAcknowledging(true);
    try {
      await markAnnouncementRead(critical.id);
      await loadAnnouncements();
    } finally {
      setAcknowledging(false);
    }
  }

  return (
    // No onClose: a critical announcement cannot be dismissed, only read.
    <Dialog open={Boolean(critical)} fullWidth maxWidth="sm" className="critical-gate">
      {critical && (
        <>
          <DialogTitle>
            <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", color: "var(--danger)" }}>
              <ReportRounded />
              <span>{t("announcements.criticalGate")}</span>
            </Stack>
          </DialogTitle>
          <DialogContent>
            <Typography variant="h6" sx={{ fontWeight: 750 }}>
              {critical.title}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {tf("announcements.byline", {
                name: critical.authorName,
                date: new Date(critical.createdAt).toLocaleString(LOCALE, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }),
              })}
            </Typography>
            <Typography sx={{ mt: 2, whiteSpace: "pre-wrap", lineHeight: 1.65 }}>
              {critical.body}
            </Typography>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button
              variant="contained"
              color="error"
              startIcon={<CheckCircleRounded />}
              disabled={acknowledging}
              onClick={() => void acknowledge()}
            >
              {t("announcements.ack")}
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}
