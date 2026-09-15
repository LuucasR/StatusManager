import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Snackbar,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api";
import { t, tf } from "../../i18n";
import { useOnReconnect, useSocketEvent } from "../../realtime/useSocketEvent";

type Reason = "offHours" | "admin";

type RequestPayload = { timeoutSeconds?: number; reason?: Reason } | undefined;

type PendingResponse =
  | { pending: false }
  | { pending: true; secondsLeft: number; reason: Reason };

/** Only used against a server that predates the payload on the event. */
const FALLBACK_SECONDS = 120;

/**
 * The "are you still working?" check, on every page.
 *
 * Lives in the layout and not in the dashboard. It used to be rendered by
 * DashboardPage alone while the socket belongs to the layout, so on /tasks or
 * the calendar the server saw a connected socket, sent the prompt, nothing drew
 * it, and the timer auto-disconnected somebody who was never asked.
 *
 * On mount and on every reconnect it also asks the server whether a check is
 * already open: a reload or a phone waking up inside the window misses the
 * socket event, and would otherwise lose the question the same way.
 */
export default function ActivityConfirmationDialog({ me }: { me: { id: number } | null }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<Reason>("offHours");
  const [countdown, setCountdown] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");

  const show = useCallback((seconds: number, why: Reason) => {
    setReason(why);
    setCountdown(seconds);
    // A fresh prompt has to clear the previous one's in-flight flag, or a
    // failed attempt would leave the new dialog's button permanently disabled.
    setConfirming(false);
    setOpen(true);
  }, []);

  const syncPending = useCallback(async () => {
    try {
      const pending = await api<PendingResponse>("/activities/pending-confirmation");
      if (pending.pending) show(pending.secondsLeft, pending.reason);
      // Nothing open any more (answered in another tab, expired while offline):
      // a dialog left up would only lead to a 400 on click.
      else setOpen(false);
    } catch {
      // Best effort: the live event is still the primary path.
    }
  }, [show]);

  useEffect(() => {
    void syncPending();
  }, [syncPending]);

  useOnReconnect(() => void syncPending());

  useSocketEvent<RequestPayload>("confirmation:request", (payload) => {
    show(payload?.timeoutSeconds ?? FALLBACK_SECONDS, payload?.reason ?? "admin");
  });

  // Both of these are broadcast to EVERY client, so the payload has to be
  // checked: without it, one person's check closing would close the dialog of
  // anyone else who happened to have one open.
  useSocketEvent<{ employeeId: number }>("confirmation:confirmed", (payload) => {
    if (payload?.employeeId === me?.id) setOpen(false);
  });

  // The server drops the pending check when its timer fires. Closing the dialog
  // here is what stops the button outliving the thing it acts on.
  useSocketEvent<{ employeeId: number }>("confirmation:timeout", (payload) => {
    if (payload?.employeeId !== me?.id) return;
    setOpen(false);
    setConfirming(false);
    setMessage(t("dashboard.confirmationExpired"));
  });

  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => {
      setCountdown((value) => (value <= 1 ? 0 : value - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [open]);

  /**
   * The failure path matters as much as the success one: the check may already
   * be gone (timer fired, second click), and the call then answers 400. Whatever
   * the reason there is nothing left to confirm, so the dialog closes either way
   * and the message is surfaced instead of swallowed.
   */
  async function confirmActivity() {
    if (confirming) return;
    setConfirming(true);
    try {
      await api("/activities/confirm-activity", { method: "POST" });
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setConfirming(false);
      setOpen(false);
    }
  }

  return (
    <>
      <Dialog open={open}>
        <DialogTitle>{t("dashboard.confirmationTitle")}</DialogTitle>

        <DialogContent>
          <Typography>
            {reason === "admin"
              ? t("dashboard.confirmationBody")
              : t("activityCheck.offHoursBody")}
          </Typography>

          <Typography sx={{ mt: 2 }}>
            {tf("dashboard.confirmationCountdown", { seconds: countdown })}
          </Typography>
        </DialogContent>

        <DialogActions>
          {/* Changing the status is itself an answer: the server buries the
              open check the moment the new status is saved. */}
          <Button
            onClick={() => {
              setOpen(false);
              navigate("/dashboard?changeStatus=1");
            }}
          >
            {t("dashboard.changeActivity")}
          </Button>

          <Button
            variant="contained"
            disabled={confirming}
            onClick={() => void confirmActivity()}
          >
            {t("dashboard.stillOnIt")}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(message)}
        autoHideDuration={8000}
        onClose={() => setMessage("")}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="warning" onClose={() => setMessage("")} sx={{ width: "100%" }}>
          {message}
        </Alert>
      </Snackbar>
    </>
  );
}
