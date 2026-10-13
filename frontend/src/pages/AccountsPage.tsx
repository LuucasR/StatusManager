import {
  BadgeRounded,
  CheckRounded,
  CloseRounded,
  DeleteForeverRounded,
  HourglassTopRounded,
  KeyRounded,
  PersonAddAlt1Rounded,
  PersonOffRounded,
  RestartAltRounded,
  SearchRounded,
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
  DialogContentText,
  DialogTitle,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate, useOutletContext } from "react-router-dom";
import type { AppOutletContext } from "../layouts/AppLayout";
import { isAdminRole, roleMeta } from "../components/roles";
import NewAccountDialog from "../components/admin/NewAccountDialog";
import ChangeRoleDialog from "../components/admin/ChangeRoleDialog";
import {
  approveSignUp,
  deactivateAccount,
  deleteAccount,
  listAccounts,
  listPasswordRequests,
  reactivateAccount,
  rejectSignUp,
  resolvePasswordRequest,
  type Account,
  type PasswordRequest,
} from "../components/admin/accountsApi";
import { useOnReconnect, useSocketEvent } from "../realtime/useSocketEvent";
import { t, tf } from "../i18n";
import { LOCALE } from "../locale";

type StatusFilter = "all" | "ACTIVE" | "DEACTIVATED";

/** A pending confirmation: what to ask and what to run on yes. */
type Confirm = {
  title: string;
  body: string;
  confirmLabel: string;
  color: "error" | "warning" | "primary";
  run: () => Promise<void>;
};

function formatDate(value: string) {
  return new Date(value).toLocaleString(LOCALE, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * The Accounts tab, admin only: sign-ups and password resets waiting for a
 * decision, and every account with its role and whether it can sign in.
 * Mounted for everyone like WorkdayPage, because the role is only known once
 * AppLayout has fetched it; every endpoint behind it refuses non-admins.
 */
export default function AccountsPage() {
  const { me } = useOutletContext<AppOutletContext>();

  if (!me) {
    return (
      <Container maxWidth="lg" sx={{ py: 6 }}>
        <CircularProgress />
      </Container>
    );
  }

  if (!isAdminRole(me.role)) return <Navigate to="/announcements" replace />;

  return <AccountsAdmin meId={me.id} />;
}

function AccountsAdmin({ meId }: { meId: number }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [requests, setRequests] = useState<PasswordRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const [newAccountOpen, setNewAccountOpen] = useState(false);
  const [roleTarget, setRoleTarget] = useState<Account | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [issuedPassword, setIssuedPassword] = useState<{ name: string; password: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [nextAccounts, nextRequests] = await Promise.all([listAccounts(), listPasswordRequests()]);
      setAccounts(nextAccounts);
      setRequests(nextRequests);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  useSocketEvent("accounts:changed", () => void load());
  useOnReconnect(() => void load());

  /** Runs one action with its row disabled, then refreshes. */
  async function run(key: string, action: () => Promise<void>) {
    setBusy(key);
    setError("");
    try {
      await action();
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const pendingSignUps = accounts.filter((account) => account.accountStatus === "PENDING");

  const members = useMemo(() => {
    const query = search.trim().toLowerCase();
    return accounts
      .filter((account) => account.accountStatus !== "PENDING")
      .filter((account) => statusFilter === "all" || account.accountStatus === statusFilter)
      .filter(
        (account) =>
          !query ||
          account.name.toLowerCase().includes(query) ||
          account.email.toLowerCase().includes(query) ||
          String(account.employeeNumber).includes(query)
      );
  }, [accounts, search, statusFilter]);

  function askReject(account: Account) {
    setConfirm({
      title: t("accounts.rejectTitle"),
      body: tf("accounts.confirmReject", { name: account.name }),
      confirmLabel: t("approval.reject"),
      color: "error",
      run: () =>
        run(`signup-${account.id}`, async () => {
          await rejectSignUp(account.id);
          setNotice(tf("accounts.rejected", { name: account.name }));
        }),
    });
  }

  function askPasswordDecision(request: PasswordRequest, decision: "APPROVED" | "REJECTED") {
    const name = request.employee.name;
    setConfirm({
      title: t("dashboard.passwordRequests"),
      body: tf(
        decision === "APPROVED" ? "dashboard.confirmApprovePassword" : "dashboard.confirmRejectPassword",
        { name }
      ),
      confirmLabel: decision === "APPROVED" ? t("approval.approve") : t("approval.reject"),
      color: decision === "APPROVED" ? "primary" : "error",
      run: () =>
        run(`reset-${request.id}`, async () => {
          const result = await resolvePasswordRequest(request.id, decision);
          // Shown once and never persisted anywhere, so it has to be captured here.
          if (result.temporaryPassword) setIssuedPassword({ name, password: result.temporaryPassword });
        }),
    });
  }

  function askDeactivate(account: Account) {
    setConfirm({
      title: t("accounts.deactivate"),
      body: tf("accounts.confirmDeactivate", { name: account.name }),
      confirmLabel: t("accounts.deactivate"),
      color: "warning",
      run: () =>
        run(`account-${account.id}`, async () => {
          await deactivateAccount(account.id);
          setNotice(tf("accounts.deactivated", { name: account.name }));
        }),
    });
  }

  function askDelete(account: Account) {
    setConfirm({
      title: t("dashboard.deleteAccount"),
      body: tf("accounts.confirmDelete", { name: account.name }),
      confirmLabel: t("common.delete"),
      color: "error",
      run: () =>
        run(`account-${account.id}`, async () => {
          await deleteAccount(account.id);
          setNotice(tf("accounts.deleted", { name: account.name }));
        }),
    });
  }

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
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

      <Box className="page-heading">
        <Box>
          <Typography className="eyebrow">{t("accounts.eyebrow")}</Typography>
          <Typography variant="h3">{t("accounts.title")}</Typography>
          <Typography color="text.secondary">{t("accounts.tagline")}</Typography>
        </Box>
        <Button
          variant="contained"
          size="large"
          startIcon={<PersonAddAlt1Rounded />}
          onClick={() => setNewAccountOpen(true)}
        >
          {t("account.newTitle")}
        </Button>
      </Box>

      {loading ? (
        <CircularProgress />
      ) : (
        <>
          <RequestPanel
            icon={<HourglassTopRounded sx={{ color: "var(--warning)" }} />}
            title={t("accounts.signUps")}
            count={pendingSignUps.length}
            empty={t("accounts.noSignUps")}
          >
            {pendingSignUps.map((account) => (
              <Box key={account.id} className="approval-row">
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography sx={{ fontWeight: 700 }} noWrap>
                    {account.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>
                    {tf("accounts.signUpMeta", {
                      email: account.email,
                      number: account.employeeNumber,
                      date: formatDate(account.createdAt),
                    })}
                  </Typography>
                </Box>
                <DecisionButtons
                  disabled={busy === `signup-${account.id}`}
                  onApprove={() =>
                    void run(`signup-${account.id}`, async () => {
                      await approveSignUp(account.id);
                      setNotice(tf("accounts.approved", { name: account.name, number: account.employeeNumber }));
                    })
                  }
                  onReject={() => askReject(account)}
                />
              </Box>
            ))}
          </RequestPanel>

          <RequestPanel
            icon={<KeyRounded sx={{ color: "var(--warning)" }} />}
            title={t("dashboard.passwordRequests")}
            count={requests.length}
            empty={t("dashboard.noPendingRequests")}
          >
            {requests.map((request) => (
              <Box key={request.id} className="approval-row">
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography sx={{ fontWeight: 700 }} noWrap>
                    #{request.employee.employeeNumber} · {request.employee.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>
                    {request.employee.email} · {formatDate(request.createdAt)}
                  </Typography>
                </Box>
                <DecisionButtons
                  disabled={busy === `reset-${request.id}`}
                  onApprove={() => askPasswordDecision(request, "APPROVED")}
                  onReject={() => askPasswordDecision(request, "REJECTED")}
                />
              </Box>
            ))}
          </RequestPanel>

          <Box className="section-title">
            <Box>
              <Typography className="eyebrow">{t("accounts.membersEyebrow")}</Typography>
              <Typography variant="h4">{t("accounts.members")}</Typography>
            </Box>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ width: { xs: "100%", sm: "auto" } }}>
              <TextField
                size="small"
                placeholder={t("accounts.search")}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
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
              <TextField
                select
                size="small"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                sx={{ minWidth: 160 }}
              >
                <MenuItem value="all">{t("common.all")}</MenuItem>
                <MenuItem value="ACTIVE">{t("accounts.status.ACTIVE")}</MenuItem>
                <MenuItem value="DEACTIVATED">{t("accounts.status.DEACTIVATED")}</MenuItem>
              </TextField>
            </Stack>
          </Box>

          <Paper className="table-card" elevation={0} sx={{ overflowX: "auto" }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t("common.employee")}</TableCell>
                  <TableCell>{t("common.email")}</TableCell>
                  <TableCell>{t("common.role")}</TableCell>
                  <TableCell>{t("common.status")}</TableCell>
                  <TableCell align="right">{t("dashboard.actions")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {members.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <Typography color="text.secondary" sx={{ py: 1 }}>
                        {t("accounts.noMatches")}
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
                {members.map((account) => {
                  const role = roleMeta(account.role);
                  const deactivated = account.accountStatus === "DEACTIVATED";
                  const self = account.id === meId;
                  const rowBusy = busy === `account-${account.id}`;
                  return (
                    <TableRow key={account.id} sx={{ opacity: deactivated ? 0.6 : 1 }}>
                      <TableCell>
                        <Typography sx={{ fontWeight: 700 }}>{account.name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          #{account.employeeNumber}
                        </Typography>
                      </TableCell>
                      <TableCell>{account.email}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={role.label}
                          sx={{ fontWeight: 700, bgcolor: role.soft, color: role.color }}
                        />
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          variant="outlined"
                          color={deactivated ? "default" : "success"}
                          label={t(`accounts.status.${account.accountStatus}`)}
                        />
                        {deactivated && account.deactivatedAt && (
                          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                            {tf("accounts.since", { date: formatDate(account.deactivatedAt) })}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                        {self ? (
                          <Typography variant="caption" color="text.secondary">
                            {t("accounts.you")}
                          </Typography>
                        ) : (
                          <>
                            {!deactivated && (
                              <Tooltip title={t("dashboard.changeRole")}>
                                <span>
                                  <IconButton disabled={rowBusy} onClick={() => setRoleTarget(account)}>
                                    <BadgeRounded fontSize="small" />
                                  </IconButton>
                                </span>
                              </Tooltip>
                            )}
                            {deactivated ? (
                              <Tooltip title={t("accounts.reactivate")}>
                                <span>
                                  <IconButton
                                    color="success"
                                    disabled={rowBusy}
                                    onClick={() =>
                                      void run(`account-${account.id}`, async () => {
                                        await reactivateAccount(account.id);
                                        setNotice(tf("accounts.reactivated", { name: account.name }));
                                      })
                                    }
                                  >
                                    <RestartAltRounded fontSize="small" />
                                  </IconButton>
                                </span>
                              </Tooltip>
                            ) : (
                              <Tooltip title={t("accounts.deactivate")}>
                                <span>
                                  <IconButton color="warning" disabled={rowBusy} onClick={() => askDeactivate(account)}>
                                    <PersonOffRounded fontSize="small" />
                                  </IconButton>
                                </span>
                              </Tooltip>
                            )}
                            <Tooltip title={t("dashboard.deleteAccount")}>
                              <span>
                                <IconButton color="error" disabled={rowBusy} onClick={() => askDelete(account)}>
                                  <DeleteForeverRounded fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Paper>
        </>
      )}

      <Dialog open={confirm !== null} onClose={() => setConfirm(null)} fullWidth maxWidth="xs">
        <DialogTitle>{confirm?.title}</DialogTitle>
        <DialogContent>
          <DialogContentText>{confirm?.body}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(null)}>{t("common.cancel")}</Button>
          <Button
            variant="contained"
            color={confirm?.color}
            onClick={() => {
              const action = confirm?.run;
              setConfirm(null);
              void action?.();
            }}
          >
            {confirm?.confirmLabel}
          </Button>
        </DialogActions>
      </Dialog>

      {/* One-time reveal: the temporary password is not stored anywhere, so if
          this is closed without copying it, it has to be regenerated. */}
      <Dialog open={Boolean(issuedPassword)} onClose={() => setIssuedPassword(null)} maxWidth="xs" fullWidth>
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
              bgcolor: "var(--surface-2)",
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
    </Container>
  );
}

/** Same look as the task approvals panel, with an empty state. */
function RequestPanel({
  icon,
  title,
  count,
  empty,
  children,
}: {
  icon: ReactNode;
  title: string;
  count: number;
  empty: string;
  children: ReactNode;
}) {
  return (
    <Paper className="approval-panel" sx={{ p: { xs: 2, md: 2.5 }, mb: 3 }}>
      <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", mb: count ? 1.5 : 0 }}>
        {icon}
        <Typography variant="h6" sx={{ fontWeight: 750, flex: 1 }}>
          {title}
        </Typography>
        <Chip
          size="small"
          color={count ? "warning" : "default"}
          label={tf("approval.count", { count })}
        />
      </Stack>
      {count === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {empty}
        </Typography>
      ) : (
        <Stack spacing={1}>{children}</Stack>
      )}
    </Paper>
  );
}

function DecisionButtons({
  disabled,
  onApprove,
  onReject,
}: {
  disabled: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
      <Button
        size="small"
        variant="contained"
        color="success"
        startIcon={<CheckRounded />}
        disabled={disabled}
        onClick={onApprove}
      >
        {t("approval.approve")}
      </Button>
      <Button
        size="small"
        variant="outlined"
        color="error"
        startIcon={<CloseRounded />}
        disabled={disabled}
        onClick={onReject}
      >
        {t("approval.reject")}
      </Button>
    </Stack>
  );
}
