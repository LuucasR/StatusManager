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
import { io } from "socket.io-client";
import { API_URL, api } from "../api";
import PdfPreviewDialog from "../components/pdf/PdfPreviewDialog";
import { usePdfPreview } from "../components/pdf/usePdfPreview";
import TaskBoard from "../components/tasks/TaskBoard";
import TaskDetailDialog from "../components/tasks/TaskDetailDialog";
import TaskFormDialog from "../components/tasks/TaskFormDialog";
import TaskReportDialog from "../components/tasks/TaskReportDialog";
import {
  addComment,
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

export default function TasksPage() {
  const { me } = useOutletContext<AppOutletContext>();
  const isAdmin = me?.role === "ADMIN";
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

  // El handler del socket se registra una sola vez; necesita leer el id actual.
  const detailIdRef = useRef<number | null>(null);
  detailIdRef.current = detailId;

  const handleError = useCallback((err: unknown) => {
    const message = (err as Error).message;
    // No hay interceptor de 401 en api(): sin esto la página queda trabada.
    if (/Sesión (inválida|requerida)/i.test(message)) {
      localStorage.removeItem("token");
      window.location.replace("/");
      return;
    }
    setError(message);
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

  useEffect(() => {
    const socket = io(API_URL, { auth: { token: localStorage.getItem("token") } });

    socket.on("task:changed", (payload: { taskId?: number }) => {
      void load();
      if (payload?.taskId && detailIdRef.current === payload.taskId) {
        void reloadDetail(payload.taskId);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [load, reloadDetail]);

  /**
   * Deep link desde el reporte: una tarea archivada ya no está en la pizarra,
   * pero GET /tasks/:id sí la devuelve, así que se puede abrir y fijar.
   */
  useEffect(() => {
    const id = Number(searchParams.get("task"));
    if (!Number.isInteger(id) || id <= 0) return;
    void openDetailById(id);
    searchParams.delete("task");
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams, openDetailById]);

  /**
   * Optimista: esperar el round-trip hace que la tarjeta "salte hacia atrás".
   * Si el backend rechaza (403 de no participante), se revierte y se muestra.
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
    // Despinnear algo que ya pasó el corte lo hace desaparecer del tablero.
    if (!pinned && daysUntilArchive(task) <= 0) {
      const ok = window.confirm(
        "Esta tarea ya superó los 14 días desde su fecha de fin. Si dejás de fijarla, desaparecerá de la pizarra. ¿Continuar?"
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

  async function handleComment(body: string) {
    if (!detailId) return;
    await addComment(detailId, body);
    await reloadDetail(detailId);
    await load();
  }

  async function handlePreviewReport(params: URLSearchParams) {
    try {
      await pdf.open(`${API_URL}/tasks/report.pdf?${params.toString()}`, "reporte-tareas.pdf");
      setReportOpen(false);
    } catch (err) {
      handleError(err);
    }
  }

  const canPinDetail = Boolean(detail && canMoveTask(detail, me?.id, me?.role));
  const canComment = Boolean(
    detail && (isAdmin || detail.participants.some((participant) => participant.id === me?.id))
  );

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      <Box className="page-heading">
        <Box>
          <Typography className="eyebrow">PIZARRA DE TAREAS</Typography>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            Tareas del equipo
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            Arrastrá una tarjeta entre columnas, o usá el menú de la tarjeta para moverla. Las
            tareas se archivan 14 días después de su fecha de fin, salvo que las fijes.
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

          {isAdmin && (
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
        canComment={canComment}
        canPin={canPinDetail}
        onClose={() => {
          setDetailId(null);
          setDetail(null);
        }}
        onComment={handleComment}
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
        title="Reporte de tareas"
        onClose={pdf.close}
        onDownload={pdf.download}
      />
    </Container>
  );
}
