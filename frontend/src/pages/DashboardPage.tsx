import {
  AdminPanelSettingsRounded,
  BadgeRounded,
  DeleteForeverRounded,
  DownloadRounded,
  PersonAddAlt1Rounded,
  UpdateRounded,
  VisibilityRounded,
} from "@mui/icons-material";
import { t, tf } from "../i18n";

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
import {
  STATUS_LABELS as labels,
  STATUS_CHIP_COLORS as colors,
  SELECTABLE_STATUSES,
  allowsTask,
  requiresDetail,
  type Status,
} from "../components/activities/statuses";
import { LOCALE } from "../locale";


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
  /** null if the task was deleted; taskTitle survives regardless. */
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

  // The period filter lives in a ref as well as in state: `load()` is registered
  // once with the socket listeners and needs to read the current range.
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

  // Two levels: staff (admin or supervisor) sees the team and its reports; admin
  // is the only one who touches accounts, roles and other people's statuses.
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

  // Assignable tasks are fetched when the dialog opens, not on page mount: the
  // most common case is never touching the picker all day. It does not apply
  // when an admin changes someone else's status, because the endpoint returns
  // the CALLER's tasks and the backend validates against the target employee.
  useEffect(() => {
    if (!dialog || selectedEmployee) return;
    let cancelled = false;
    setAssignableLoading(true);
    api<AssignableTask[]>("/activities/assignable-tasks")
      .then((tasks) => {
        if (cancelled) return;
        setAssignableTasks(tasks);
        // The task picked last time may have been finished or archived: without
        // this the Select would show a value no longer among the options, and the
        // backend would reject it on save.
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
      // GET /tasks/:id does not filter by archiving, so old tasks from the
      // history stay viewable.
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

// Shared socket from the layout: this page used to open its own and the
// listeners died on navigating to /tasks.
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

  // The picker is for self-service only: the endpoint returns MY tasks, and an
  // admin fixing someone else's status should not book their own against it.
  const showTaskSelect = allowsTask.has(status) && !selectedEmployee;

  /**
   * Mirrors resolveWorkingTask in the backend: the comment becomes mandatory
   * again for "Working" only when choosing not to declare a task WHILE having
   * tasks to pick from. With none assigned nothing is required, or somebody with
   * an empty board could not even mark themselves as working.
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
          // Only sent for WORKING: the backend rejects taskId in any other
          // status, so sending the leftover from the select would be a 400.
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
        throw new Error(data.message ?? t("pdf.failed"));
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
      t("dashboard.personalReportFilename")
    );
  }

  async function approve(id: number) {
    await api(`/admin/employees/${id}/approve`, {
      method: "PATCH",
    });

    await load();
  }

  async function reject(id: number) {
    if (!window.confirm(t("dashboard.confirmReject"))) {
      return;
    }

    await api(`/admin/employees/${id}`, {
      method: "DELETE",
    });

    await load();
  }

  async function deleteAccount(employee: Employee) {
    const confirmed = window.confirm(
      tf("dashboard.confirmDeleteAccount", { name: employee.name })
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
    // Two keys rather than interpolating a verb: Spanish and English do not
    // inflect the sentence the same way around it.
    const prompt = tf(
      decision === "APPROVED"
        ? "dashboard.confirmApprovePassword"
        : "dashboard.confirmRejectPassword",
      { name: request.employee.name }
    );
    if (!window.confirm(prompt)) {
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
            {t("dashboard.eyebrow")}
          </Typography>

          <Typography variant="h3">
            {tf("dashboard.greeting", { name: me?.name?.split(" ")[0] ?? "" })}
          </Typography>

          <Typography color="text.secondary">
            {t("dashboard.tagline")}
          </Typography>
        </Box>

        <Button
          variant="contained"
          size="large"
          startIcon={<UpdateRounded />}
          onClick={() => setDialog(true)}
        >
          {t("dashboard.changeStatus")}
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
              ? new Date(me.statusSince).toLocaleTimeString(LOCALE, {
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
              <Typography className="eyebrow">{t("dashboard.securityEyebrow")}</Typography>
              <Typography variant="h4">
                {t("dashboard.passwordRequests")}
              </Typography>
            </Box>
            <Chip
              color={passwordRequests.length ? "warning" : "default"}
              label={tf("dashboard.pendingCount", { count: passwordRequests.length })}
            />
          </Box>

          {passwordRequests.length === 0 ? (
            <Paper className="table-card" elevation={0} sx={{ p: 3 }}>
              <Typography color="text.secondary">
                {t("dashboard.noPendingRequests")}
              </Typography>
            </Paper>
          ) : (
            <Paper className="table-card" elevation={0}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>{t("common.employee")}</TableCell>
                    <TableCell>{t("common.email")}</TableCell>
                    <TableCell>{t("dashboard.date")}</TableCell>
                    <TableCell align="right">{t("dashboard.actions")}</TableCell>
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
                        {new Date(request.createdAt).toLocaleString(LOCALE)}
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
                            {t("dashboard.reject")}
                          </Button>
                          <Button
                            variant="contained"
                            onClick={() =>
                              resolvePasswordRequest(request, "APPROVED")
                            }
                          >
                            {t("dashboard.accept")}
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
                {admin
                  ? t("dashboard.adminPanel")
                  : staff
                    ? t("dashboard.supervisorPanel")
                    : t("dashboard.teamPanel")}
              </Typography>

              <Typography variant="h4">
                {t("dashboard.liveTeam")}
              </Typography>
            </Box>

            <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
              {staff && (
                <Button
                  startIcon={<VisibilityRounded />}
                  onClick={() => setReportDialog(true)}
                >
                  {t("dashboard.viewPdfReport")}
                </Button>
              )}
              {admin && (
                <Button
                  variant="contained"
                  startIcon={<PersonAddAlt1Rounded />}
                  onClick={() => setNewAccountOpen(true)}
                >
                  {t("account.newTitle")}
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
      {employee.detail || t("dashboard.noDetail")}
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
        {t("dashboard.requestConfirmation")}
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
  {t("dashboard.changeStatus")}
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
              {t("dashboard.changeRole")}
            </Button>
            <Button
              sx={{ mt: 1 }}
              fullWidth
              variant="outlined"
              color="error"
              startIcon={<DeleteForeverRounded />}
              onClick={() => deleteAccount(employee)}
            >
              {t("dashboard.deleteAccount")}
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
                      {t("dashboard.approveSignUp")}
                    </Button>

                    <Button
                      fullWidth
                      variant="outlined"
                      color="error"
                      onClick={() => reject(employee.id)}
                    >
                      {t("dashboard.reject")}
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
            {t("dashboard.recentActivity")}
          </Typography>

          <Typography variant="h4">
            {t("dashboard.yourHistory")}
          </Typography>
        </Box>

        <Button
          startIcon={<VisibilityRounded />}
          onClick={previewPersonalReport}
        >
          {t("dashboard.previewPdf")}
        </Button>
      </Box>

      <Box sx={{ mb: 2 }}>
        <PeriodFilter onChange={handlePeriodChange} />
      </Box>

      {historyTruncated && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {t("dashboard.historyTruncated")}
        </Alert>
      )}

      <Paper className="table-card" elevation={0}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>{t("common.status")}</TableCell>
              <TableCell>{t("common.task")}</TableCell>
              <TableCell>{t("dashboard.detail")}</TableCell>
              <TableCell>{t("dashboard.start")}</TableCell>
              <TableCell>{t("common.duration")}</TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {history.length === 0 && (
              <TableRow>
                <TableCell colSpan={5}>
                  <Typography color="text.secondary" sx={{ py: 2 }}>
                    {t("summary.empty")}
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
                    // The task was deleted: the FK went null and only the title
                    // snapshot survives.
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

                <TableCell>{item.detail || t("dashboard.noComment")}</TableCell>

                <TableCell>
                  {new Date(item.startedAt).toLocaleString(LOCALE)}
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
    ? tf("dashboard.updateStatusOf", { name: selectedEmployee.name })
    : t("dashboard.updateStatus")}
</DialogTitle>

      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          <FormControl fullWidth>
            <InputLabel>
              {t("dashboard.newStatus")}
            </InputLabel>

            <Select
              value={status}
              label={t("dashboard.newStatus")}
              onChange={(e) => setStatus(e.target.value as Status)}
            >
              {SELECTABLE_STATUSES.map((value) => (
                <MenuItem
                  key={value}
                  value={value}
                >
                  {labels[value]}
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
                ? t("dashboard.detailRequired")
                : t("dashboard.detailOptional")
            }
            helperText={
              detailRequired && showTaskSelect
                ? t("dashboard.noTaskChosen")
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

    {/* Task details for a history segment: participants, duration and state.
        Reuses TaskFacts, the same block the board detail shows, without
        dragging in the chat thread (which has its own ACL). */}
    <Dialog
      open={factsOpen}
      onClose={() => setFactsOpen(false)}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle>{factsTask?.title ?? t("common.task")}</DialogTitle>
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
        <Button onClick={() => setFactsOpen(false)}>{t("common.close")}</Button>
      </DialogActions>
    </Dialog>

    <Dialog
      open={confirmationDialog}
    >
      <DialogTitle>
        {t("dashboard.confirmationTitle")}
      </DialogTitle>

      <DialogContent>
        <Typography>
          {t("dashboard.confirmationBody")}
        </Typography>

        <Typography sx={{ mt: 2 }}>
          {tf("dashboard.confirmationCountdown", { seconds: confirmationCountdown })}
        </Typography>
      </DialogContent>

      <DialogActions>
        <Button
          onClick={() => {
            setConfirmationDialog(false);
            setDialog(true);
          }}
        >
          {t("dashboard.changeActivity")}
        </Button>

        <Button
          variant="contained"
          onClick={confirmActivity}
        >
          {t("dashboard.stillOnIt")}
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
    {t("dashboard.configureReport")}
  </DialogTitle>

  <DialogContent>
    <Stack spacing={3} sx={{ mt: 1 }}>

      <FormControl fullWidth>
        <InputLabel>
          {t("common.employee")}
        </InputLabel>

        <Select
          value={reportEmployee}
          label={t("common.employee")}
          onChange={(e) => setReportEmployee(e.target.value)}
        >
          <MenuItem value="all">
            {t("common.all")}
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
          {t("period.label")}
        </InputLabel>

        <Select
          value={reportPeriod}
          label={t("period.label")}
          onChange={(e) =>
            setReportPeriod(e.target.value as typeof reportPeriod)
          }
        >
          <MenuItem value="all">
            {t("period.all")}
          </MenuItem>

          <MenuItem value="today">
            {t("period.today")}
          </MenuItem>

          <MenuItem value="last7">
            {t("period.last7")}
          </MenuItem>

          <MenuItem value="custom">
            {t("period.custom")}
          </MenuItem>
        </Select>
      </FormControl>

      {reportPeriod === "custom" && (
        <Stack direction="row" spacing={2}>
          <TextField
            label={t("period.from")}
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
            label={t("period.to")}
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
      {t("taskReport.preview")}
    </Button>
  </DialogActions>
</Dialog>

<Dialog
  open={Boolean(pdfPreviewUrl)}
  onClose={closePdfPreview}
  fullWidth
  maxWidth="lg"
>
  <DialogTitle>{t("dashboard.reportPreviewTitle")}</DialogTitle>
  <DialogContent sx={{ p: { xs: 1, sm: 2 } }}>
    {pdfPreviewUrl && (
      <Box
        component="iframe"
        title={t("dashboard.reportPreviewFrameTitle")}
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
    <Button onClick={closePdfPreview}>{t("common.close")}</Button>
    <Button
      variant="contained"
      startIcon={<DownloadRounded />}
      onClick={downloadPreviewedPdf}
    >
      {t("pdf.download")}
    </Button>
  </DialogActions>
</Dialog>

{/* One-time reveal: the temporary password is not stored anywhere, so if this
    is closed without copying it, it has to be regenerated. */}
<Dialog
  open={Boolean(issuedPassword)}
  onClose={() => setIssuedPassword(null)}
  maxWidth="xs"
  fullWidth
>
  <DialogTitle>{t("dashboard.temporaryPassword")}</DialogTitle>
  <DialogContent>
    <Typography color="text.secondary" sx={{ mb: 2 }}>
      {tf("dashboard.temporaryPasswordNote", { name: issuedPassword?.name ?? "" })}
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
      {t("dashboard.copied")}
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
