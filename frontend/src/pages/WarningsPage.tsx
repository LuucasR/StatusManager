import { AddRounded, BlockRounded } from "@mui/icons-material";
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
  FormControlLabel,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useOutletContext } from "react-router-dom";
import { isAdminRole } from "../components/roles";
import type { AppOutletContext } from "../layouts/AppLayout";
import { t, tf } from "../i18n";
import { LOCALE } from "../locale";
import { useOnReconnect, useSocketEvent } from "../realtime/useSocketEvent";
import {
  getMyWarnings,
  getTeamWarnings,
  grantWarning,
  listEmployees,
  revokeWarning,
  type TeamWarnings,
  type Warning,
  type WarningEmployee,
} from "../components/warnings/warningsApi";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(LOCALE);
}

/** "2026-09", 2 -> "2026-09, 16th to end", reusing the attendance labels. */
function halfLabel(warning: Warning) {
  if (!warning.month || !warning.half) return null;
  return tf("warnings.half", {
    month: warning.month,
    range: t(warning.half === 1 ? "attendance.firstHalfShort" : "attendance.secondHalfShort"),
  });
}

/**
 * The Warnings tab. Everyone sees their own; an admin sees the whole team and
 * grants or revokes them. Same role wait as AttendancePage.
 */
export default function WarningsPage() {
  const { me } = useOutletContext<AppOutletContext>();

  if (!me) {
    return (
      <Container maxWidth="lg" sx={{ py: 6 }}>
        <CircularProgress />
      </Container>
    );
  }

  return isAdminRole(me.role) ? <AdminWarnings /> : <MyWarnings />;
}

function StatusChip({ warning }: { warning: Warning }) {
  return warning.revokedAt ? (
    <Chip size="small" variant="outlined" label={t("warnings.revoked")} />
  ) : (
    <Chip
      size="small"
      label={t("warnings.active")}
      sx={{ bgcolor: "#b23c4a", color: "#fff", fontWeight: 700 }}
    />
  );
}

/** Reason, the half's numbers and who revoked it, stacked in one cell. */
function Details({ warning }: { warning: Warning }) {
  const half = halfLabel(warning);
  return (
    <Box sx={{ opacity: warning.revokedAt ? 0.6 : 1 }}>
      <Typography
        variant="body2"
        sx={{ textDecoration: warning.revokedAt ? "line-through" : "none", whiteSpace: "pre-wrap" }}
      >
        {warning.source === "MANUAL" ? warning.reason : half}
      </Typography>
      {warning.source === "AUTO_LATE" && warning.lateMinutes !== null && (
        <Typography variant="caption" color="text.secondary" component="div">
          {tf("warnings.lateUsed", { used: warning.lateMinutes, tolerance: warning.tolerance ?? 0 })}
        </Typography>
      )}
      {warning.source === "MANUAL" && warning.createdByName && (
        <Typography variant="caption" color="text.secondary" component="div">
          {tf("warnings.grantedBy", { name: warning.createdByName })}
        </Typography>
      )}
      {warning.revokedAt && (
        <Typography variant="caption" color="text.secondary" component="div">
          {warning.revokedBySystem || !warning.revokedByName
            ? tf("warnings.revokedAuto", { reason: warning.revokeReason ?? "" })
            : tf("warnings.revokedBy", {
                name: warning.revokedByName,
                reason: warning.revokeReason ?? "",
              })}
        </Typography>
      )}
    </Box>
  );
}

function Heading({ admin, action }: { admin: boolean; action?: ReactNode }) {
  return (
    <Box className="page-heading">
      <Box>
        <Typography className="eyebrow">{t("warnings.eyebrow")}</Typography>
        <Typography variant="h4" sx={{ fontWeight: 800 }}>
          {t("warnings.title")}
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 0.5 }}>
          {admin ? t("warnings.subtitleAdmin") : t("warnings.subtitle")}
        </Typography>
      </Box>
      {action}
    </Box>
  );
}

function MyWarnings() {
  const [warnings, setWarnings] = useState<Warning[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setWarnings(await getMyWarnings());
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useSocketEvent("warnings:changed", () => void load());
  useOnReconnect(() => void load());

  const active = warnings?.filter((warning) => !warning.revokedAt).length ?? 0;

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      <Heading admin={false} action={<Chip label={tf("warnings.activeCount", { count: active })} />} />

      <Paper className="status-card" elevation={0} sx={{ p: 3, mt: 3 }}>
        {!warnings ? (
          <CircularProgress />
        ) : warnings.length === 0 ? (
          <Typography color="text.secondary">{t("warnings.myEmpty")}</Typography>
        ) : (
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t("warnings.date")}</TableCell>
                  <TableCell>{t("warnings.type")}</TableCell>
                  <TableCell>{t("warnings.reason")}</TableCell>
                  <TableCell>{t("warnings.status")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {warnings.map((warning) => (
                  <TableRow key={warning.id}>
                    <TableCell>{formatDate(warning.createdAt)}</TableCell>
                    <TableCell>{t(`warnings.source.${warning.source}`)}</TableCell>
                    <TableCell>
                      <Details warning={warning} />
                    </TableCell>
                    <TableCell>
                      <StatusChip warning={warning} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </Paper>
    </Container>
  );
}

function AdminWarnings() {
  const [data, setData] = useState<TeamWarnings | null>(null);
  const [employees, setEmployees] = useState<WarningEmployee[]>([]);
  const [filter, setFilter] = useState("all");
  const [showRevoked, setShowRevoked] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [granting, setGranting] = useState(false);
  const [revoking, setRevoking] = useState<Warning | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await getTeamWarnings(filter === "all" ? undefined : Number(filter)));
    } catch (err) {
      setError((err as Error).message);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    listEmployees()
      .then(setEmployees)
      .catch((err: Error) => setError(err.message));
  }, []);

  useSocketEvent("warnings:changed", () => void load());
  useOnReconnect(() => void load());

  const rows = useMemo(
    () => data?.rows.filter((row) => showRevoked || !row.revokedAt) ?? [],
    [data, showRevoked]
  );

  // Only the people who have any, most first: the point is to spot them.
  const perEmployee = useMemo(() => {
    const counts = new Map<number, { employee: WarningEmployee; count: number }>();
    for (const row of data?.rows ?? []) {
      if (row.revokedAt) continue;
      const current = counts.get(row.employee.id) ?? { employee: row.employee, count: 0 };
      current.count += 1;
      counts.set(row.employee.id, current);
    }
    return [...counts.values()].sort((a, b) => b.count - a.count);
  }, [data]);

  async function grant(employeeId: number, reason: string) {
    await grantWarning(employeeId, reason);
    setGranting(false);
    setNotice(t("warnings.granted"));
    await load();
  }

  async function revoke(reason: string) {
    if (!revoking) return;
    await revokeWarning(revoking.id, reason);
    setRevoking(null);
    setNotice(t("warnings.revokedNotice"));
    await load();
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError("")}>
          {error}
        </Alert>
      )}
      {notice && (
        <Alert severity="success" sx={{ mb: 3 }} onClose={() => setNotice("")}>
          {notice}
        </Alert>
      )}

      <Heading
        admin
        action={
          <Button variant="contained" startIcon={<AddRounded />} onClick={() => setGranting(true)}>
            {t("warnings.grant")}
          </Button>
        }
      />

      {perEmployee.length > 0 && (
        <Paper className="status-card" elevation={0} sx={{ p: 3, mt: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
            {t("warnings.perEmployee")}
          </Typography>
          <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>
            {perEmployee.map(({ employee, count }) => (
              <Chip
                key={employee.id}
                label={`${employee.name} · ${count}`}
                onClick={() => setFilter(String(employee.id))}
                color={filter === String(employee.id) ? "primary" : "default"}
              />
            ))}
          </Stack>
        </Paper>
      )}

      <Paper className="status-card" elevation={0} sx={{ p: 3, mt: 3 }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          sx={{ mb: 2, alignItems: { sm: "center" } }}
          useFlexGap
        >
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel>{t("warnings.employee")}</InputLabel>
            <Select
              value={filter}
              label={t("warnings.employee")}
              onChange={(e) => setFilter(e.target.value)}
            >
              <MenuItem value="all">{t("warnings.allEmployees")}</MenuItem>
              {employees.map((employee) => (
                <MenuItem key={employee.id} value={String(employee.id)}>
                  {employee.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControlLabel
            control={
              <Switch checked={showRevoked} onChange={(e) => setShowRevoked(e.target.checked)} />
            }
            label={t("warnings.showRevoked")}
          />
        </Stack>

        {data?.truncated && (
          <Alert severity="info" sx={{ mb: 2 }}>
            {t("warnings.truncated")}
          </Alert>
        )}

        {!data ? (
          <CircularProgress />
        ) : (
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t("warnings.date")}</TableCell>
                  <TableCell>{t("warnings.employee")}</TableCell>
                  <TableCell>{t("warnings.type")}</TableCell>
                  <TableCell>{t("warnings.reason")}</TableCell>
                  <TableCell>{t("warnings.status")}</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <Typography color="text.secondary" sx={{ py: 2 }}>
                        {t("warnings.empty")}
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{formatDate(row.createdAt)}</TableCell>
                    <TableCell>
                      {row.employee.name} · #{row.employee.employeeNumber}
                    </TableCell>
                    <TableCell>{t(`warnings.source.${row.source}`)}</TableCell>
                    <TableCell>
                      <Details warning={row} />
                    </TableCell>
                    <TableCell>
                      <StatusChip warning={row} />
                    </TableCell>
                    <TableCell align="right">
                      {!row.revokedAt && (
                        <Button
                          size="small"
                          color="inherit"
                          startIcon={<BlockRounded />}
                          onClick={() => setRevoking(row)}
                        >
                          {t("warnings.revoke")}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </Paper>

      <Box sx={{ height: 40 }} />

      <GrantDialog
        open={granting}
        employees={employees}
        initialEmployee={filter === "all" ? "" : filter}
        onClose={() => setGranting(false)}
        onSubmit={grant}
      />
      <ReasonDialog
        open={revoking !== null}
        title={t("warnings.revokeTitle")}
        label={t("warnings.revokeReason")}
        onClose={() => setRevoking(null)}
        onSubmit={revoke}
      />
    </Container>
  );
}

function GrantDialog(props: {
  open: boolean;
  employees: WarningEmployee[];
  initialEmployee: string;
  onClose: () => void;
  onSubmit: (employeeId: number, reason: string) => Promise<void>;
}) {
  const [employee, setEmployee] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!props.open) return;
    setEmployee(props.initialEmployee);
    setReason("");
    setError("");
  }, [props.open, props.initialEmployee]);

  async function submit() {
    setSaving(true);
    setError("");
    try {
      await props.onSubmit(Number(employee), reason.trim());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={props.open} onClose={props.onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t("warnings.grantTitle")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <FormControl fullWidth>
            <InputLabel>{t("warnings.employee")}</InputLabel>
            <Select
              value={employee}
              label={t("warnings.employee")}
              onChange={(e) => setEmployee(e.target.value)}
            >
              {props.employees.map((option) => (
                <MenuItem key={option.id} value={String(option.id)}>
                  {option.name} · #{option.employeeNumber}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label={t("warnings.reason")}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            multiline
            minRows={3}
            slotProps={{ htmlInput: { maxLength: 500 } }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={props.onClose}>{t("warnings.cancel")}</Button>
        <Button
          variant="contained"
          onClick={() => void submit()}
          disabled={saving || !employee || !reason.trim()}
        >
          {t("warnings.grant")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function ReasonDialog(props: {
  open: boolean;
  title: string;
  label: string;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!props.open) return;
    setReason("");
    setError("");
  }, [props.open]);

  async function submit() {
    setSaving(true);
    setError("");
    try {
      await props.onSubmit(reason.trim());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={props.open} onClose={props.onClose} fullWidth maxWidth="sm">
      <DialogTitle>{props.title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label={props.label}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            multiline
            minRows={2}
            slotProps={{ htmlInput: { maxLength: 500 } }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={props.onClose}>{t("warnings.cancel")}</Button>
        <Button
          variant="contained"
          color="error"
          onClick={() => void submit()}
          disabled={saving || !reason.trim()}
        >
          {t("warnings.confirm")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
