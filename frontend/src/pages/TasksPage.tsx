import { AddRounded, PictureAsPdfRounded } from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  Stack,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useRef, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { API_URL, api } from "../api";
import { useOnReconnect, useSocketEvent } from "../realtime/useSocketEvent";
import PdfPreviewDialog from "../components/pdf/PdfPreviewDialog";
import { usePdfPreview } from "../components/pdf/usePdfPreview";
import TaskBoard from "../components/tasks/TaskBoard";
import TaskDetailDialog from "../components/tasks/TaskDetailDialog";
import TaskFormDialog from "../components/tasks/TaskFormDialog";
import TaskReportDialog from "../components/tasks/TaskReportDialog";
import {
  createTask,
  deleteTask,
  getTask,
  listTasks,
  moveTask,
  pinTask,
  updateTask,
  type TaskPayload,
} from "../components/tasks/tasksApi";
import {
  canMoveTask,
  daysUntilArchive,
  type Task,
  type TaskParticipant,
  type TaskState,
} from "../components/tasks/types";
import type { AppOutletContext } from "../layouts/AppLayout";
import { canManageTasks, isStaff } from "../components/roles";
import { t } from "../i18n";

export default function TasksPage() {
  const { me } = useOutletContext<AppOutletContext>();
  // Board management: admin, supervisor or task manager.
  const canManage = canManageTasks(me?.role);
  const [searchParams, setSearchParams] = useSearchParams();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [employees, setEmployees] = useState<TaskParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);

  const [detail, setDetail] = useState<Task | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [reportOpen, setReportOpen] = useState(false);
  const pdf = usePdfPreview();

  // The socket handler is registered once; it needs to read the current id.
  const detailIdRef = useRef<number | null>(null);
  detailIdRef.current = detailId;

  // 401 is handled centrally by api(); here the error is only displayed.
  const handleError = useCallback((err: unknown) => {
    setError((err as Error).message);
  }, []);

  const load = useCallback(async () => {
    try {
      const [taskList, team] = await Promise.all([
        listTasks(),
        api<TaskParticipant[]>("/activities/team"),
      ]);
      setTasks(taskList);
      setEmployees(team.map((e) => ({ id: e.id, employeeNumber: e.employeeNumber, name: e.name })));
      setError("");
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  }, [handleError]);

  const reloadDetail = useCallback(
    async (id: number) => {
      try {
        setDetail(await getTask(id));
      } catch (err) {
        handleError(err);
      }
    },
    [handleError]
  );

  const openDetailById = useCallback(
    async (id: number) => {
      setDetailId(id);
      setDetailLoading(true);
      setDetail(null);
      try {
        setDetail(await getTask(id));
      } catch (err) {
        handleError(err);
        setDetailId(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [handleError]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useSocketEvent<{ taskId?: number }>("task:changed", (payload) => {
    void load();
    if (payload?.taskId && detailIdRef.current === payload.taskId) {
      void reloadDetail(payload.taskId);
    }
  });

  // The socket does not buffer what was emitted while it was down: re-sync on return.
  useOnReconnect(() => {
    void load();
    if (detailIdRef.current) void reloadDetail(detailIdRef.current);
  });

  /**
   * Deep link from the report: an archived task is no longer on the board, but
   * GET /tasks/:id still returns it, so it can be opened and pinned.
   */
  useEffect(() => {
    const id = Number(searchParams.get("task"));
    if (!Number.isInteger(id) || id <= 0) return;
    void openDetailById(id);
    searchParams.delete("task");
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams, openDetailById]);

  /**
   * Optimistic: waiting for the round-trip makes the card "jump back". If the
   * backend refuses (403 for a non-participant), it is reverted and surfaced.
   */
  async function handleMove(taskId: number, state: TaskState) {
    const previous = tasks;
    setTasks((current) => current.map((task) => (task.id === taskId ? { ...task, state } : task)));
    setError("");
    try {
      await moveTask(taskId, state);
    } catch (err) {
      setTasks(previous);
      handleError(err);
    }
  }

  async function handlePin(task: Task, pinned: boolean) {
    // Unpinning something already past the cutoff makes it vanish from the board.
    if (!pinned && daysUntilArchive(task) <= 0) {
      const ok = window.confirm(
        t("tasksPage.unpinWarning")
      );
      if (!ok) return;
    }

    const previous = tasks;
    setTasks((current) => current.map((t) => (t.id === task.id ? { ...t, pinned } : t)));
    setError("");
    try {
      await pinTask(task.id, pinned);
      await load();
      if (detailIdRef.current === task.id) await reloadDetail(task.id);
    } catch (err) {
      setTasks(previous);
      handleError(err);
    }
  }

  async function handleSubmit(payload: TaskPayload, taskId?: number) {
    if (taskId) await updateTask(taskId, payload);
    else await createTask(payload);
    await load();
  }

  async function handleDelete(task: Task) {
    if (!window.confirm(`¿Eliminar la tarea "${task.title}"? Se borran sus comentarios.`)) return;
    try {
      await deleteTask(task.id);
      if (detailId === task.id) setDetailId(null);
      await load();
    } catch (err) {
      handleError(err);
    }
  }

  async function handlePreviewReport(params: URLSearchParams) {
    try {
      await pdf.open(`${API_URL}/tasks/report.pdf?${params.toString()}`, t("taskReport.filename"));
      setReportOpen(false);
    } catch (err) {
      handleError(err);
    }
  }

  const canPinDetail = Boolean(detail && canMoveTask(detail, me?.id, me?.role));
  // Reading and writing the thread follow the CHAT rule, not the board's: a task
  // manager who is not a participant administers the card but not its
  // conversation. Mirrors canCommentOnTask and chat.access.ts in the backend.
  const isParticipant = Boolean(
    detail?.participants.some((participant) => participant.id === me?.id)
  );
  const canReadChat = Boolean(detail) && (isStaff(me?.role) || isParticipant);
  const canComment = canReadChat;

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      <Box className="page-heading">
        <Box>
          <Typography className="eyebrow">{t("tasksPage.eyebrow")}</Typography>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            {t("tasksPage.title")}
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            {t("tasksPage.subtitle")}
          </Typography>
        </Box>

        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", flexWrap: "wrap" }}>
          <Button
            variant="outlined"
            size="large"
            startIcon={<PictureAsPdfRounded />}
            onClick={() => setReportOpen(true)}
          >
            Reporte PDF
          </Button>

          {canManage && (
            <Button
              variant="contained"
              size="large"
              startIcon={<AddRounded />}
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              Nueva tarea
            </Button>
          )}
        </Stack>
      </Box>

      {loading ? (
        <Stack sx={{ alignItems: "center", py: 8 }}>
          <CircularProgress />
        </Stack>
      ) : (
        <TaskBoard
          tasks={tasks}
          meId={me?.id}
          role={me?.role}
          onOpen={(task) => void openDetailById(task.id)}
          onMove={handleMove}
          onPin={handlePin}
          onEdit={(task) => {
            setEditing(task);
            setFormOpen(true);
          }}
          onDelete={handleDelete}
        />
      )}

      <TaskFormDialog
        open={formOpen}
        task={editing}
        employees={employees}
        onClose={() => setFormOpen(false)}
        onSubmit={handleSubmit}
      />

      <TaskDetailDialog
        open={detailId !== null}
        task={detail}
        loading={detailLoading}
        canReadChat={canReadChat}
        canComment={canComment}
        canPin={canPinDetail}
        me={me ? { id: me.id, name: me.name } : null}
        onClose={() => {
          setDetailId(null);
          setDetail(null);
        }}
        onPin={handlePin}
      />

      <TaskReportDialog
        open={reportOpen}
        employees={employees}
        loading={pdf.loading}
        onClose={() => setReportOpen(false)}
        onPreview={handlePreviewReport}
      />

      <PdfPreviewDialog
        url={pdf.url}
        title={t("taskReport.title")}
        onClose={pdf.close}
        onDownload={pdf.download}
      />
    </Container>
  );
}
