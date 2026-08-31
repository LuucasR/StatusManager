import {
  AdminPanelSettingsRounded,
  BadgeRounded,
  DeleteForeverRounded,
  DownloadRounded,
  PersonAddAlt1Rounded,
  UpdateRounded,
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
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, API_URL } from "../api";
import { useOnReconnect, useSocketEvent } from "../realtime/useSocketEvent";
import { isAdminRole, isStaff, roleMeta, type Role } from "../components/roles";
import NewAccountDialog from "../components/admin/NewAccountDialog";
import ChangeRoleDialog from "../components/admin/ChangeRoleDialog";
import PeriodFilter from "../components/PeriodFilter";
import WorkingTaskSelect, {
  type AssignableTask,
} from "../components/activities/WorkingTaskSelect";
import TaskFacts from "../components/tasks/TaskFacts";
import { STATE_META, type Task, type TaskState } from "../components/tasks/types";

type Status =
  | "AVAILABLE"
  | "WORKING"
  | "BREAK"
  | "LUNCH"
  | "MEETING"
  | "OFFLINE"
  | "DISCONNECTED";

type Employee = {
  id: number;
  employeeNumber: number;
  name: string;
  email?: string;
  role?: Role;
  currentStatus: Status;
  statusSince: string;
  detail: string;
  active?: boolean;
};

type History = {
  id: number;
  status: Status;
  detail: string;
  startedAt: string;
  endedAt: string | null;
  /** null si la tarea fue eliminada; taskTitle sobrevive igual. */
  task: { id: number; title: string; state: TaskState } | null;
  taskTitle: string | null;
};

type HistoryResponse = { rows: History[]; truncated: boolean };

type PasswordChangeRequest = {
  id: number;
  createdAt: string;
  employee: {
    id: number;
    employeeNumber: number;
    name: string;
    email: string;
  };
};

const labels: Record<Status, string> = {
  AVAILABLE: "Disponible",
  WORKING: "Trabajando",
  BREAK: "Descanso",
  LUNCH: "Almuerzo",
  MEETING: "Reunión",
  OFFLINE: "Ausente",
  DISCONNECTED: "Desconectado",
};

const colors: Record<
  Status,
  "success" | "primary" | "warning" | "secondary" | "info" | "default" | "error"
> = {
  AVAILABLE: "success",
  WORKING: "primary",
  BREAK: "warning",
  LUNCH: "secondary",
  MEETING: "info",
  OFFLINE: "default",
  DISCONNECTED: "error",
};

// Estados que exigen comentario. Espeja statusesRequiringDetail del backend
// (backend/src/activities/activity-status.ts). WORKING salió de la lista cuando
// se pudo declarar la tarea; vuelve a exigirlo solo si se elige "Sin tarea".
const requiresDetail = new Set<Status>(["OFFLINE"]);

// Único estado donde se declara una tarea. Espeja statusesAllowingTask.
const allowsTask = new Set<Status>(["WORKING"]);


function elapsed(since: string, now: number) {
  const seconds = Math.max(
    0,
    Math.floor((now - new Date(since).getTime()) / 1000)
  );

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  return `${String(h).padStart(2, "0")}:${String(m).padStart(
    2,
    "0"
  )}:${String(s).padStart(2, "0")}`;
}

async function requestConfirmation(id: number) {
  await api(`/admin/employees/${id}/request-confirmation`, {
    method: "POST",
  });
}

export default function DashboardPage() {
  const [me, setMe] = useState<Employee | null>(null);
  const [history, setHistory] = useState<History[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [passwordRequests, setPasswordRequests] = useState<
    PasswordChangeRequest[]
  >([]);
  const [now, setNow] = useState(Date.now());

  const [dialog, setDialog] = useState(false);
  const [status, setStatus] = useState<Status>("WORKING");
  const [detail, setDetail] = useState("");
  const [taskId, setTaskId] = useState<number | null>(null);
  const [assignableTasks, setAssignableTasks] = useState<AssignableTask[]>([]);
  const [assignableLoading, setAssignableLoading] = useState(false);

  // El filtro de período vive en un ref además del estado: `load()` se registra
  // una sola vez en los listeners del socket y necesita leer el rango actual.
  const [historyParams, setHistoryParams] = useState(() => new URLSearchParams());
  const historyParamsRef = useRef(historyParams);
  historyParamsRef.current = historyParams;
  const [historyTruncated, setHistoryTruncated] = useState(false);

  const [factsTask, setFactsTask] = useState<Task | null>(null);
  const [factsOpen, setFactsOpen] = useState(false);
  const [factsLoading, setFactsLoading] = useState(false);

  const [error, setError] = useState("");
  const [confirmationDialog, setConfirmationDialog] = useState(false);
const [confirmationCountdown, setConfirmationCountdown] = useState(120);
const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

const [reportDialog, setReportDialog] = useState(false);

const [reportEmployee, setReportEmployee] = useState("all");

const [reportPeriod, setReportPeriod] = useState<
  "all" | "today" | "last7" | "custom"
>("all");

const [reportFrom, setReportFrom] = useState("");

const [reportTo, setReportTo] = useState("");
const [pdfPreviewUrl, setPdfPreviewUrl] = useState("");
const [pdfPreviewName, setPdfPreviewName] = useState("");
const [pdfPreviewLoading, setPdfPreviewLoading] = useState(false);
const [newAccountOpen, setNewAccountOpen] = useState(false);
const [roleTarget, setRoleTarget] = useState<Employee | null>(null);
const [notice, setNotice] = useState("");

  // Dos niveles: staff (admin o supervisor) ve al equipo y sus reportes; admin
  // es el unico que toca cuentas, roles y estados ajenos.
  const staff = isStaff(me?.role);
  const admin = isAdminRole(me?.role);

  const loadHistory = useCallback(async (params: URLSearchParams) => {
    const query = params.toString();
    const response = await api<HistoryResponse>(
      `/activities/history${query ? `?${query}` : ""}`
    );
    setHistory(response.rows);
    setHistoryTruncated(response.truncated);
  }, []);

  const load = useCallback(async () => {
    const current = await api<Employee>("/activities/me");

    setMe(current);

    await loadHistory(historyParamsRef.current);

    setEmployees(
      await api<Employee[]>(
        isStaff(current.role)
          ? "/admin/employees"
          : "/activities/team"
      )
    );

    if (isAdminRole(current.role)) {
      setPasswordRequests(
        await api<PasswordChangeRequest[]>(
          "/admin/password-change-requests"
        )
      );
    }
  }, [loadHistory]);

  const handlePeriodChange = useCallback(
    (params: URLSearchParams) => {
      setHistoryParams(params);
      loadHistory(params).catch((e) => setError((e as Error).message));
    },
    [loadHistory]
  );

  // Las tareas asignables se piden al abrir el diálogo, no al montar la página:
  // el estado más común es no tocar el selector en toda la jornada. No aplica
  // cuando un admin cambia el estado de otro, porque el endpoint devuelve las
  // tareas de quien consulta y el backend valida contra el empleado destino.
  useEffect(() => {
    if (!dialog || selectedEmployee) return;
    let cancelled = false;
    setAssignableLoading(true);
    api<AssignableTask[]>("/activities/assignable-tasks")
      .then((tasks) => {
        if (cancelled) return;
        setAssignableTasks(tasks);
        // La tarea elegida la vez anterior pudo terminarse o archivarse: sin
        // esto el Select mostraría un valor que ya no está entre las opciones,
        // y el backend lo rechazaría al guardar.
        setTaskId((current) =>
          current !== null && tasks.some((task) => task.id === current) ? current : null
        );
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setAssignableLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dialog, selectedEmployee]);

  async function openTaskFacts(id: number) {
    setFactsOpen(true);
    setFactsLoading(true);
    setFactsTask(null);
    try {
      // GET /tasks/:id no filtra por archivado, así que las tareas viejas del
      // historial siguen siendo consultables.
      setFactsTask(await api<Task>(`/tasks/${id}`));
    } catch (e) {
      setError((e as Error).message);
      setFactsOpen(false);
    } finally {
      setFactsLoading(false);
    }
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));

    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, [load]);

// Socket compartido del layout: antes esta página abría el suyo propio y los
// listeners morían al navegar a /tareas.
useSocketEvent("status:changed", () => load());

useSocketEvent("confirmation:request", () => {
  setConfirmationDialog(true);
  setConfirmationCountdown(120);
});

useSocketEvent("confirmation:confirmed", () => load());

useSocketEvent("confirmation:timeout", () => load());

useOnReconnect(() => load());

  const duration = useMemo(
    () => (me ? elapsed(me.statusSince, now) : "00:00:00"),
    [me, now]
  );

  // El selector es solo para el self-service: el endpoint devuelve MIS tareas,
  // y un admin corrigiendo el estado de otro no debería imputarle las propias.
  const showTaskSelect = allowsTask.has(status) && !selectedEmployee;

  /**
   * Espeja resolveWorkingTask del backend: el comentario vuelve a ser
   * obligatorio en "Trabajando" solo cuando se elige no declarar tarea TENIENDO
   * tareas para elegir. Sin tareas asignadas no se exige nada, o alguien sin
   * pizarra no podría ni marcar que está trabajando.
   */
  const detailRequired =
    requiresDetail.has(status) ||
    (showTaskSelect && taskId === null && assignableTasks.length > 0);

  async function changeStatus() {
    try {
      await api(
  selectedEmployee
    ? `/admin/employees/${selectedEmployee.id}/status`
    : "/activities/status",
  {
        method: "POST",
        body: JSON.stringify({
          status,
          detail,
          // Solo va en WORKING: el backend rechaza taskId en cualquier otro
          // estado, así que mandar el residuo del select sería un 400.
          taskId: allowsTask.has(status) && !selectedEmployee ? taskId : null,
        }),
      });

      setSelectedEmployee(null);
      setDialog(false);
      setDetail("");
      setTaskId(null);

      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function confirmActivity() {
  await api("/activities/confirm-activity", {
    method: "POST",
  });

  setConfirmationDialog(false);
}

useEffect(() => {

  if (!confirmationDialog) {
    return;
  }

  const timer = setInterval(() => {

    setConfirmationCountdown((value) => {

      if (value <= 1) {
        clearInterval(timer);
        return 0;
      }

      return value - 1;

    });

  }, 1000);

  return () => clearInterval(timer);

}, [confirmationDialog]);


  function buildReportParams() {
    const params = new URLSearchParams();
    params.set("employeeId", reportEmployee);

    if (reportPeriod === "all") params.set("period", "all");
    if (reportPeriod === "today") params.set("period", "today");
    if (reportPeriod === "last7") params.set("period", "last7");
    if (reportPeriod === "custom") {
      params.set("from", reportFrom);
      params.set("to", reportTo);
    }

    return params;
  }

  async function openPdfPreview(url: string, filename: string) {
    try {
      setPdfPreviewLoading(true);
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message ?? "No se pudo generar el PDF");
      }

      const blob = await response.blob();
      const href = URL.createObjectURL(blob);

      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
      setPdfPreviewUrl(href);
      setPdfPreviewName(filename);
      setReportDialog(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPdfPreviewLoading(false);
    }
  }

  function closePdfPreview() {
    if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
    setPdfPreviewUrl("");
    setPdfPreviewName("");
  }

  function downloadPreviewedPdf() {
    if (!pdfPreviewUrl) return;
    const anchor = document.createElement("a");
    anchor.href = pdfPreviewUrl;
    anchor.download = pdfPreviewName;
    anchor.click();
  }

  async function previewReport() {
    await openPdfPreview(
      `${API_URL}/admin/report.pdf?${buildReportParams().toString()}`,
      "reporte-actividades.pdf"
    );
  }

  async function previewPersonalReport() {
    await openPdfPreview(
      `${API_URL}/activities/report.pdf`,
      "mi-registro-de-actividades.pdf"
    );
  }

  async function approve(id: number) {
    await api(`/admin/employees/${id}/approve`, {
      method: "PATCH",
    });

    await load();
  }

  async function reject(id: number) {
    if (!window.confirm("¿Rechazar esta solicitud de registro?")) {
      return;
    }

    await api(`/admin/employees/${id}`, {
      method: "DELETE",
    });

    await load();
  }

  async function deleteAccount(employee: Employee) {
    const confirmed = window.confirm(
      `¿Eliminar definitivamente la cuenta de ${employee.name}? También se eliminará todo su historial de actividades.`
    );

    if (!confirmed) return;

    try {
      await api(`/admin/employees/${employee.id}`, {
        method: "DELETE",
      });
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const [issuedPassword, setIssuedPassword] = useState<
    { name: string; password: string } | null
  >(null);

  async function resolvePasswordRequest(
    request: PasswordChangeRequest,
    decision: "APPROVED" | "REJECTED"
  ) {
    const action = decision === "APPROVED" ? "aprobar" : "rechazar";
    if (
      !window.confirm(
        `¿Confirmás que querés ${action} el cambio de contraseña de ${request.employee.name}?`
      )
    ) {
      return;
    }

    try {
      const result = await api<{ temporaryPassword?: string }>(
        `/admin/password-change-requests/${request.id}`,
        { method: "PATCH", body: JSON.stringify({ decision }) }
      );
      // Shown once and never persisted anywhere, so it has to be captured here.
      if (result.temporaryPassword) {
        setIssuedPassword({
          name: request.employee.name,
          password: result.temporaryPassword,
        });
      }
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
  <Box>
    <Container maxWidth="xl" sx={{ py: 4 }}>
      {error && (
        <Alert
          severity="error"
          sx={{ mb: 3 }}
          onClose={() => setError("")}
        >
          {error}
        </Alert>
      )}

      {notice && (
        <Alert severity="success" sx={{ mb: 3 }} onClose={() => setNotice("")}>
          {notice}
        </Alert>
      )}

      <Box className="page-heading">
        <Box>
          <Typography className="eyebrow">
            MI JORNADA
          </Typography>

          <Typography variant="h3">
            Hola, {me?.name?.split(" ")[0]}
          </Typography>

          <Typography color="text.secondary">
            Mantené tu actividad actualizada para que el equipo esté conectado.
          </Typography>
        </Box>

        <Button
          variant="contained"
          size="large"
          startIcon={<UpdateRounded />}
          onClick={() => setDialog(true)}
        >
          Cambiar estado
        </Button>
      </Box>

      <Box className="status-grid">
        <Paper className="status-card" elevation={0}>
          <Typography color="text.secondary">
            Estado actual
          </Typography>

          <Stack
            direction="row"
            spacing={1.5}
            sx={{ alignItems: "center", mt: 2 }}
          >
            <span className={`status-dot ${me?.currentStatus.toLowerCase()}`} />

            <Typography variant="h4">
              {me ? labels[me.currentStatus] : "—"}
            </Typography>
          </Stack>
        </Paper>

        <Paper className="status-card accent" elevation={0}>
          <Typography color="text.secondary">
            Tiempo transcurrido
          </Typography>

          <Typography className="timer">
            {duration}
          </Typography>

          <Typography variant="caption" color="text.secondary">
            desde{" "}
            {me
              ? new Date(me.statusSince).toLocaleTimeString("es-AR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—"}
          </Typography>
        </Paper>
      </Box>

      {admin && (
        <>
          <Box className="section-title">
            <Box>
              <Typography className="eyebrow">SEGURIDAD</Typography>
              <Typography variant="h4">
                Solicitudes de cambio de contraseña
              </Typography>
            </Box>
            <Chip
              color={passwordRequests.length ? "warning" : "default"}
              label={`${passwordRequests.length} pendientes`}
            />
          </Box>

          {passwordRequests.length === 0 ? (
            <Paper className="table-card" elevation={0} sx={{ p: 3 }}>
              <Typography color="text.secondary">
                No hay solicitudes pendientes.
              </Typography>
            </Paper>
          ) : (
            <Paper className="table-card" elevation={0}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Empleado</TableCell>
                    <TableCell>Email</TableCell>
                    <TableCell>Fecha</TableCell>
                    <TableCell align="right">Acciones</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {passwordRequests.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell>
                        #{request.employee.employeeNumber} ·{" "}
                        {request.employee.name}
                      </TableCell>
                      <TableCell>{request.employee.email}</TableCell>
                      <TableCell>
                        {new Date(request.createdAt).toLocaleString("es-AR")}
                      </TableCell>
                      <TableCell align="right">
                        <Stack
                          direction="row"
                          spacing={1}
                          sx={{ justifyContent: "flex-end" }}
                        >
                          <Button
                            color="error"
                            onClick={() =>
                              resolvePasswordRequest(request, "REJECTED")
                            }
                          >
                            Rechazar
                          </Button>
                          <Button
                            variant="contained"
                            onClick={() =>
                              resolvePasswordRequest(request, "APPROVED")
                            }
                          >
                            Aceptar
                          </Button>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          )}
        </>
      )}

      <>
          <Box className="section-title">
            <Box>
              <Typography className="eyebrow">
                {admin ? "PANEL ADMINISTRADOR" : staff ? "PANEL SUPERVISOR" : "EQUIPO"}
              </Typography>

              <Typography variant="h4">
                Equipo en vivo
              </Typography>
            </Box>

            <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
              {staff && (
                <Button
                  startIcon={<VisibilityRounded />}
                  onClick={() => setReportDialog(true)}
                >
                  Ver reporte PDF
                </Button>
              )}
              {admin && (
                <Button
                  variant="contained"
                  startIcon={<PersonAddAlt1Rounded />}
                  onClick={() => setNewAccountOpen(true)}
                >
                  Nueva cuenta
                </Button>
              )}
            </Stack>
          </Box>

          <Box className="employee-grid">
            {employees.map((employee) => (
              <Paper
                key={employee.id}
                className="employee-card"
                elevation={0}
              >
     <Stack
  direction="row"
  sx={{
    justifyContent: "space-between",
    alignItems: "center",
  }}
>
                  <Box>
                   <Typography sx={{ fontWeight: 700 }}>
  {employee.name}
</Typography>

                    <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
                      <Typography variant="caption" color="text.secondary">
                        #{employee.employeeNumber}
                      </Typography>
                      {employee.role && employee.role !== "EMPLOYEE" && (
                        <Chip
                          size="small"
                          label={roleMeta(employee.role).label}
                          sx={{
                            height: 18,
                            fontSize: 10,
                            fontWeight: 700,
                            bgcolor: roleMeta(employee.role).soft,
                            color: roleMeta(employee.role).color,
                          }}
                        />
                      )}
                    </Stack>
                  </Box>

                  {employee.active ? (
                    <Chip
                      size="small"
                      color={colors[employee.currentStatus]}
                      label={labels[employee.currentStatus]}
                    />
                  ) : (
                    <Chip
                      size="small"
                      color="warning"
                      label="Pendiente"
                    />
                  )}
                </Stack>

{employee.active ? (
  <>
    <Typography
      variant="body2"
      color="text.secondary"
      sx={{
        mt: 2,
        minHeight: 42,
        whiteSpace: "pre-wrap",
      }}
    >
      {employee.detail || "Sin detalle"}
    </Typography>

    <Typography className="mini-timer">
      {elapsed(employee.statusSince, now)}
    </Typography>

    {staff && (
      <Button
        sx={{ mt: 2 }}
        fullWidth
        variant="outlined"
        onClick={() => requestConfirmation(employee.id)}
      >
        Solicitar confirmación
      </Button>
    )}
    {admin && (
      <>
    <Button
  sx={{ mt: 1 }}
  fullWidth
  variant="contained"
  onClick={() => {
    setSelectedEmployee(employee);
    setDialog(true);
  }}
>
  Cambiar estado
</Button>
        {employee.id !== me?.id && (
          <>
            <Button
              sx={{ mt: 1 }}
              fullWidth
              variant="outlined"
              startIcon={<BadgeRounded />}
              onClick={() => setRoleTarget(employee)}
            >
              Cambiar rol
            </Button>
            <Button
              sx={{ mt: 1 }}
              fullWidth
              variant="outlined"
              color="error"
              startIcon={<DeleteForeverRounded />}
              onClick={() => deleteAccount(employee)}
            >
              Eliminar cuenta
            </Button>
          </>
        )}
      </>
    )}
  </>
): (
                  <Stack spacing={1} sx={{ mt: 3 }}>
                    <Button
                      fullWidth
                      variant="contained"
                      startIcon={<AdminPanelSettingsRounded />}
                      onClick={() => approve(employee.id)}
                    >
                      Aprobar alta
                    </Button>

                    <Button
                      fullWidth
                      variant="outlined"
                      color="error"
                      onClick={() => reject(employee.id)}
                    >
                      Rechazar
                    </Button>
                  </Stack>
                )}
              </Paper>
            ))}
          </Box>
        </>

      <Box className="section-title">
        <Box>
          <Typography className="eyebrow">
            ACTIVIDAD RECIENTE
          </Typography>

          <Typography variant="h4">
            Tu historial
          </Typography>
        </Box>

        <Button
          startIcon={<VisibilityRounded />}
          onClick={previewPersonalReport}
        >
          Previsualizar PDF
        </Button>
      </Box>

      <Box sx={{ mb: 2 }}>
        <PeriodFilter onChange={handlePeriodChange} />
      </Box>

      {historyTruncated && (
        <Alert severity="info" sx={{ mb: 2 }}>
          El período tiene más registros de los que entran en la tabla. Se muestran los más
          recientes; el resumen sí cuenta el período completo.
        </Alert>
      )}

      <Paper className="table-card" elevation={0}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Estado</TableCell>
              <TableCell>Tarea</TableCell>
              <TableCell>Detalle</TableCell>
              <TableCell>Inicio</TableCell>
              <TableCell>Duración</TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {history.length === 0 && (
              <TableRow>
                <TableCell colSpan={5}>
                  <Typography color="text.secondary" sx={{ py: 2 }}>
                    No hay actividad registrada en este período.
                  </Typography>
                </TableCell>
              </TableRow>
            )}

            {history.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <Chip
                    size="small"
                    color={colors[item.status]}
                    label={labels[item.status]}
                  />
                </TableCell>

                <TableCell>
                  {item.task ? (
                    <Chip
                      size="small"
                      clickable
                      onClick={() => void openTaskFacts(item.task!.id)}
                      label={item.task.title}
                      sx={{
                        maxWidth: 220,
                        fontWeight: 600,
                        bgcolor: STATE_META[item.task.state].soft,
                        color: STATE_META[item.task.state].ink,
                      }}
                    />
                  ) : item.taskTitle ? (
                    // La tarea fue eliminada: el FK quedó en null y solo
                    // sobrevive el snapshot del título.
                    <Typography
                      variant="body2"
                      color="text.disabled"
                      sx={{ fontStyle: "italic" }}
                    >
                      {item.taskTitle} (eliminada)
                    </Typography>
                  ) : (
                    <Typography variant="body2" color="text.disabled">
                      —
                    </Typography>
                  )}
                </TableCell>

                <TableCell>{item.detail || "Sin comentario"}</TableCell>

                <TableCell>
                  {new Date(item.startedAt).toLocaleString("es-AR")}
                </TableCell>

                <TableCell>
                  {elapsed(
                    item.startedAt,
                    item.endedAt
                      ? new Date(item.endedAt).getTime()
                      : now
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Container>

    <Dialog
      open={dialog}
      onClose={() => {
  setDialog(false);
  setSelectedEmployee(null);
}}
      fullWidth
      maxWidth="sm"
    >
 <DialogTitle>
  {selectedEmployee
    ? `Actualizar estado de ${selectedEmployee.name}`
    : "Actualizar estado"}
</DialogTitle>

      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          <FormControl fullWidth>
            <InputLabel>
              Nuevo estado
            </InputLabel>

            <Select
              value={status}
              label="Nuevo estado"
              onChange={(e) => setStatus(e.target.value as Status)}
            >
              {Object.entries(labels).map(([value, label]) => (
                <MenuItem
                  key={value}
                  value={value}
                >
                  {label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {showTaskSelect && (
            <WorkingTaskSelect
              tasks={assignableTasks}
              loading={assignableLoading}
              value={taskId}
              onChange={setTaskId}
            />
          )}

          <TextField
            label={
              detailRequired
                ? "Comentario obligatorio"
                : "Comentario opcional"
            }
            placeholder={
              detailRequired
                ? "Escribí al menos 3 caracteres"
                : "Podés agregar un comentario"
            }
            helperText={
              detailRequired && showTaskSelect
                ? "Elegiste trabajar sin una tarea de la pizarra: contá en qué estás."
                : undefined
            }
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            multiline
            minRows={3}
          />
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button
          onClick={() => {
            setDialog(false);
            setSelectedEmployee(null);
          }}
        >
          Cancelar
        </Button>

        <Button
          variant="contained"
          disabled={detailRequired && detail.trim().length < 3}
          onClick={changeStatus}
        >
          Guardar cambio
        </Button>
      </DialogActions>
    </Dialog>

    {/* Detalles de la tarea de un tramo del historial: integrantes, duración y
        estado. Se reusa TaskFacts, el mismo bloque que muestra el detalle de la
        pizarra, sin arrastrar el hilo de chat (que tiene su propio ACL). */}
    <Dialog
      open={factsOpen}
      onClose={() => setFactsOpen(false)}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle>{factsTask?.title ?? "Tarea"}</DialogTitle>
      <DialogContent dividers>
        {factsLoading || !factsTask ? (
          <Stack sx={{ alignItems: "center", py: 4 }}>
            <CircularProgress />
          </Stack>
        ) : (
          <TaskFacts task={factsTask} showState />
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setFactsOpen(false)}>Cerrar</Button>
      </DialogActions>
    </Dialog>

    <Dialog
      open={confirmationDialog}
    >
      <DialogTitle>
        Confirmación de actividad
      </DialogTitle>

      <DialogContent>
        <Typography>
          El administrador solicita confirmar tu actividad actual.
        </Typography>

        <Typography sx={{ mt: 2 }}>
          Tiempo restante: {confirmationCountdown}s
        </Typography>
      </DialogContent>

      <DialogActions>
        <Button
          onClick={() => {
            setConfirmationDialog(false);
            setDialog(true);
          }}
        >
          Cambiar actividad
        </Button>

        <Button
          variant="contained"
          onClick={confirmActivity}
        >
          Sí, continúo
        </Button>
      </DialogActions>
    </Dialog>
    <Dialog
  open={reportDialog}
  onClose={() => setReportDialog(false)}
  fullWidth
  maxWidth="sm"
>
  <DialogTitle>
    Configurar reporte PDF
  </DialogTitle>

  <DialogContent>
    <Stack spacing={3} sx={{ mt: 1 }}>

      <FormControl fullWidth>
        <InputLabel>
          Empleado
        </InputLabel>

        <Select
          value={reportEmployee}
          label="Empleado"
          onChange={(e) => setReportEmployee(e.target.value)}
        >
          <MenuItem value="all">
            Todos
          </MenuItem>

          {employees.map((employee) => (
            <MenuItem
              key={employee.id}
              value={String(employee.id)}
            >
              #{employee.employeeNumber} - {employee.name}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <FormControl fullWidth>
        <InputLabel>
          Período
        </InputLabel>

        <Select
          value={reportPeriod}
          label="Período"
          onChange={(e) =>
            setReportPeriod(e.target.value as typeof reportPeriod)
          }
        >
          <MenuItem value="all">
            Todo el historial
          </MenuItem>

          <MenuItem value="today">
            Hoy
          </MenuItem>

          <MenuItem value="last7">
            Últimos 7 días
          </MenuItem>

          <MenuItem value="custom">
            Rango personalizado
          </MenuItem>
        </Select>
      </FormControl>

      {reportPeriod === "custom" && (
        <Stack direction="row" spacing={2}>
          <TextField
            label="Desde"
            type="date"
            value={reportFrom}
            onChange={(e) => setReportFrom(e.target.value)}
           slotProps={{
  inputLabel: {
    shrink: true,
  },
}}
            fullWidth
          />

          <TextField
            label="Hasta"
            type="date"
            value={reportTo}
            onChange={(e) => setReportTo(e.target.value)}
            slotProps={{
  inputLabel: {
    shrink: true,
  },
}}
            fullWidth
          />
        </Stack>
      )}
    </Stack>
  </DialogContent>

  <DialogActions>
    <Button onClick={() => setReportDialog(false)}>
      Cancelar
    </Button>

    <Button
      variant="contained"
      startIcon={
        pdfPreviewLoading
          ? <CircularProgress size={18} color="inherit" />
          : <VisibilityRounded />
      }
      disabled={
        pdfPreviewLoading ||
        (reportPeriod === "custom" && (!reportFrom || !reportTo))
      }
      onClick={previewReport}
    >
      Previsualizar
    </Button>
  </DialogActions>
</Dialog>

<Dialog
  open={Boolean(pdfPreviewUrl)}
  onClose={closePdfPreview}
  fullWidth
  maxWidth="lg"
>
  <DialogTitle>Previsualización del reporte</DialogTitle>
  <DialogContent sx={{ p: { xs: 1, sm: 2 } }}>
    {pdfPreviewUrl && (
      <Box
        component="iframe"
        title="Previsualización del reporte PDF"
        src={pdfPreviewUrl}
        sx={{
          width: "100%",
          height: { xs: "68vh", md: "76vh" },
          border: 0,
          borderRadius: 1,
          bgcolor: "grey.100",
        }}
      />
    )}
  </DialogContent>
  <DialogActions>
    <Button onClick={closePdfPreview}>Cerrar</Button>
    <Button
      variant="contained"
      startIcon={<DownloadRounded />}
      onClick={downloadPreviewedPdf}
    >
      Descargar PDF
    </Button>
  </DialogActions>
</Dialog>

{/* Reveal de un solo uso: la contraseña temporal no se guarda en ningun
    lado, asi que si se cierra sin copiarla hay que regenerarla. */}
<Dialog
  open={Boolean(issuedPassword)}
  onClose={() => setIssuedPassword(null)}
  maxWidth="xs"
  fullWidth
>
  <DialogTitle>Contraseña temporal</DialogTitle>
  <DialogContent>
    <Typography color="text.secondary" sx={{ mb: 2 }}>
      Pasásela a {issuedPassword?.name}. No se guarda en ningún lado y no se
      vuelve a mostrar. Al entrar, va a tener que elegir una nueva.
    </Typography>
    <Typography
      component="code"
      sx={{
        display: "block",
        p: 2,
        borderRadius: 1,
        bgcolor: "grey.100",
        fontSize: 20,
        letterSpacing: ".08em",
        textAlign: "center",
      }}
    >
      {issuedPassword?.password}
    </Typography>
  </DialogContent>
  <DialogActions>
    <Button variant="contained" onClick={() => setIssuedPassword(null)}>
      Ya la copié
    </Button>
  </DialogActions>
</Dialog>

<NewAccountDialog
  open={newAccountOpen}
  onClose={() => setNewAccountOpen(false)}
  onCreated={(message) => {
    setNotice(message);
    void load();
  }}
/>

<ChangeRoleDialog
  employee={roleTarget}
  onClose={() => setRoleTarget(null)}
  onChanged={(message) => {
    setNotice(message);
    void load();
  }}
/>
  </Box>
);
}
