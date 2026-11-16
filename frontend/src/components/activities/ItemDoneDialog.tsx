import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api";
import { t, tf } from "../../i18n";
import { useOnReconnect, useSocketEvent } from "../../realtime/useSocketEvent";
import {
  WorkingItemSelect,
  type AssignableTask,
} from "./WorkingTaskSelect";
import { pendingItemIds, type WorkingItem } from "./working-items";

type Me = {
  currentStatus: string;
  detail: string;
  taskId: number | null;
  taskTitle: string | null;
  checklistItems: WorkingItem[];
};

type Finished = {
  taskId: number;
  taskTitle: string;
  /** The declared items that got ticked off. */
  done: { id: number; text: string }[];
  /** The declared items still pending: preselected, they are usually carried on. */
  keep: number[];
};

const finishedKey = (finished: Finished | null) =>
  finished ? finished.done.map((item) => item.id).join(",") : "";

/**
 * "You finished this item - which ones are you moving on to?"
 *
 * Opens when a checklist item somebody is Working on gets ticked off (by them
 * or by anyone else), so the time from then on is booked against the next
 * items instead of piling up on one that is already done. The other items they
 * declared stay selected. Their segment is never switched behind their back:
 * they pick, or say "later".
 *
 * Lives in the layout, like the activity check, so it shows on whatever page
 * the item was ticked from. On mount and on reconnect it also asks the server,
 * because a tab that was closed when the item got ticked missed the event.
 */
export default function ItemDoneDialog({ me }: { me: { id: number } | null }) {
  const navigate = useNavigate();
  const [finished, setFinished] = useState<Finished | null>(null);
  const [detail, setDetail] = useState("");
  const [task, setTask] = useState<AssignableTask | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [itemIds, setItemIds] = useState<number[]>([]);
  const [error, setError] = useState("");
  // Items the person already answered "later" to, so a reconnect does not nag.
  const dismissed = useRef(new Set<number>());

  const meId = me?.id;
  const openRef = useRef<Finished | null>(null);
  openRef.current = finished;

  const sync = useCallback(async () => {
    if (!meId) return;
    try {
      const current = await api<Me>("/activities/me");
      setDetail(current.detail ?? "");
      const done = (current.checklistItems ?? []).flatMap((item) =>
        item.done && item.id != null ? [{ id: item.id, text: item.text }] : []
      );
      if (
        current.currentStatus === "WORKING" &&
        current.taskId &&
        done.some((item) => !dismissed.current.has(item.id))
      ) {
        const next: Finished = {
          taskId: current.taskId,
          taskTitle: current.taskTitle ?? "",
          done,
          keep: pendingItemIds(current.checklistItems),
        };
        // Same items already on screen: keep them, or the picker would reset.
        if (finishedKey(openRef.current) === finishedKey(next)) return;
        setFinished(next);
      } else if (openRef.current) {
        // Moved on some other way (the dashboard, another tab): nothing to ask.
        setFinished(null);
        setTask(null);
      }
    } catch {
      // Not worth a banner: the dashboard shows the same thing.
    }
  }, [meId]);

  useEffect(() => {
    void sync();
  }, [sync]);
  useOnReconnect(() => void sync());

  useSocketEvent<{ itemId?: number }>("activity:item-done", (payload) => {
    if (!payload?.itemId) return;
    dismissed.current.delete(payload.itemId);
    // Through the server rather than the payload alone: it also brings the
    // current comment, which the new segment keeps.
    void sync();
  });
  useSocketEvent("status:changed", () => {
    if (openRef.current) void sync();
  });

  // The task's pending items, fetched when the question opens.
  useEffect(() => {
    if (!finished) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    setItemIds([]);
    api<AssignableTask[]>("/activities/assignable-tasks")
      .then((tasks) => {
        if (cancelled) return;
        const found = tasks.find((candidate) => candidate.id === finished.taskId) ?? null;
        setTask(found);
        const keep = found
          ? finished.keep.filter((id) => found.items.some((item) => item.id === id))
          : [];
        setItemIds(keep.length > 0 ? keep : found?.items.length === 1 ? [found.items[0]!.id] : []);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [finished]);

  function close() {
    finished?.done.forEach((item) => dismissed.current.add(item.id));
    setFinished(null);
    setTask(null);
  }

  async function switchItem() {
    if (!finished || itemIds.length === 0) return;
    setSaving(true);
    try {
      await api("/activities/status", {
        method: "POST",
        body: JSON.stringify({
          status: "WORKING",
          detail,
          taskId: finished.taskId,
          checklistItemIds: itemIds,
        }),
      });
      setFinished(null);
      setTask(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const taskTitle = task?.title ?? finished?.taskTitle ?? "";
  const noneLeft = !loading && (!task || task.items.length === 0);

  return (
    <Dialog open={!!finished} onClose={close} fullWidth maxWidth="sm">
      <DialogTitle>{t("itemDone.title")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {loading ? (
            <Stack sx={{ alignItems: "center", py: 3 }}>
              <CircularProgress />
            </Stack>
          ) : noneLeft ? (
            <Typography>
              {tf("itemDone.noneLeft", { task: taskTitle })}
            </Typography>
          ) : (
            <>
              <Typography>
                {tf("itemDone.body", {
                  item: (finished?.done ?? []).map((item) => item.text).join(", "),
                  task: taskTitle,
                })}
              </Typography>
              <WorkingItemSelect items={task!.items} value={itemIds} onChange={setItemIds} />
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>{t("itemDone.later")}</Button>
        <Button
          onClick={() => {
            close();
            navigate("/dashboard?changeStatus=1");
          }}
        >
          {t("itemDone.changeTask")}
        </Button>
        {!noneLeft && (
          <Button variant="contained" disabled={saving || loading || itemIds.length === 0} onClick={switchItem}>
            {t("itemDone.switch")}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
