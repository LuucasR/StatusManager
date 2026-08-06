import {
  AdminPanelSettingsRounded,
  DeleteForeverRounded,
  DownloadRounded,
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

import { useCallback, useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import { api, API_URL } from "../api";

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
  role?: "EMPLOYEE" | "ADMIN";
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
};

type PasswordChangeRequest = {
  id: number;
  requestedPassword: string;
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
// (backend/src/activities/activity-status.ts).
const requiresDetail = new Set<Status>(["WORKING", "OFFLINE"]);


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


  const load = useCallback(async () => {
    const current = await api<Employee>("/activities/me");

    setMe(current);

    setHistory(
      await api<History[]>("/activities/history")
    );

    setEmployees(
      await api<Employee[]>(
        current.role === "ADMIN"
          ? "/admin/employees"
          : "/activities/team"
      )
    );

    if (current.role === "ADMIN") {
      setPasswordRequests(
        await api<PasswordChangeRequest[]>(
          "/admin/password-change-requests"
        )
      );
    }
  }, []);

  useEffect(() => {
    load().catch((e) => setError(e.message));

    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, [load]);

useEffect(() => {
  const socket = io(API_URL, {
    auth: {
      token: localStorage.getItem("token"),
    },
  });

  socket.on("status:changed", () => load());

  socket.on("confirmation:request", () => {
    setConfirmationDialog(true);
    setConfirmationCountdown(120);
  });

  socket.on("confirmation:confirmed", () => {
    load();
  });

  socket.on("confirmation:timeout", () => {
    load();
  });

  return () => {
    socket.disconnect();
  };
}, [load]);

  const duration = useMemo(
    () => (me ? elapsed(me.statusSince, now) : "00:00:00"),
    [me, now]
  );

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
        }),
      });

      setSelectedEmployee(null);
      setDialog(false);
      setDetail("");

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
      await api(`/admin/password-change-requests/${request.id}`, {
        method: "PATCH",
        body: JSON.stringify({ decision }),
      });
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

      {me?.role === "ADMIN" && (
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
                    <TableCell>Contraseña solicitada</TableCell>
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
                        <Typography
                          component="code"
                          sx={{
                            px: 1,
                            py: 0.5,
                            borderRadius: 1,
                            bgcolor: "grey.100",
                          }}
                        >
                          {request.requestedPassword}
                        </Typography>
                      </TableCell>
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
                {me?.role === "ADMIN" ? "PANEL ADMINISTRADOR" : "EQUIPO"}
              </Typography>

              <Typography variant="h4">
                Equipo en vivo
              </Typography>
            </Box>

            {me?.role === "ADMIN" && (
              <Button
                startIcon={<VisibilityRounded />}
                onClick={() => setReportDialog(true)}
              >
                Ver reporte PDF
              </Button>
            )}
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

                    <Typography
                      variant="caption"
                      color="text.secondary"
                    >
                      #{employee.employeeNumber}
                    </Typography>
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

    {me?.role === "ADMIN" && (
      <>
    <Button
      sx={{ mt: 2 }}
      fullWidth
      variant="outlined"
      onClick={() => requestConfirmation(employee.id)}
    >
      Solicitar confirmación
    </Button>
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

      <Paper className="table-card" elevation={0}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Estado</TableCell>
              <TableCell>Detalle</TableCell>
              <TableCell>Inicio</TableCell>
              <TableCell>Duración</TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {history.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <Chip
                    size="small"
                    color={colors[item.status]}
                    label={labels[item.status]}
                  />
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

          <TextField
            label={
              requiresDetail.has(status)
                ? "Comentario obligatorio"
                : "Comentario opcional"
            }
            placeholder={
              requiresDetail.has(status)
                ? "Escribí al menos 3 caracteres"
                : "Podés agregar un comentario"
            }
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            multiline
            minRows={3}
          />
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={() => setDialog(false)}>
          Cancelar
        </Button>

        <Button
          variant="contained"
          disabled={requiresDetail.has(status) && detail.trim().length < 3}
          onClick={changeStatus}
        >
          Guardar cambio
        </Button>
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
  </Box>
);
}
