import { VisibilityRounded } from "@mui/icons-material";
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
} from "@mui/material";
import { useState } from "react";
import { STATE_META, STATE_ORDER, type TaskParticipant } from "./types";
import { t } from "../../i18n";

type Period = "all" | "last30" | "last90" | "custom";

type Props = {
  open: boolean;
  employees: TaskParticipant[];
  loading: boolean;
  onClose: () => void;
  onPreview: (params: URLSearchParams) => Promise<void>;
};

export default function TaskReportDialog({ open, employees, loading, onClose, onPreview }: Props) {
  const [participant, setParticipant] = useState("all");
  const [state, setState] = useState("all");
  const [period, setPeriod] = useState<Period>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  function buildParams() {
    const params = new URLSearchParams();
    // Keys set to "all" are omitted rather than sent and string-compared in the
    // handler.
    if (participant !== "all") params.set("participantId", participant);
    if (state !== "all") params.set("state", state);
    params.set("period", period);
    if (period === "custom") {
      params.set("from", from);
      params.set("to", to);
    }
    return params;
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t("taskReport.title")}</DialogTitle>

      <DialogContent>
        <Stack spacing={3} sx={{ mt: 1 }}>
          <Alert severity="info" variant="outlined">
            {t("taskReport.note")}
          </Alert>

          <FormControl fullWidth>
            <InputLabel>{t("taskReport.participant")}</InputLabel>
            <Select
              value={participant}
              label={t("taskReport.participant")}
              onChange={(e) => setParticipant(e.target.value)}
            >
              <MenuItem value="all">{t("common.all")}</MenuItem>
              {employees.map((employee) => (
                <MenuItem key={employee.id} value={String(employee.id)}>
                  #{employee.employeeNumber} - {employee.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl fullWidth>
            <InputLabel>{t("common.status")}</InputLabel>
            <Select value={state} label={t("common.status")} onChange={(e) => setState(e.target.value)}>
              <MenuItem value="all">{t("common.all")}</MenuItem>
              {STATE_ORDER.map((value) => (
                <MenuItem key={value} value={value}>
                  {STATE_META[value].label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl fullWidth>
            <InputLabel>{t("period.label")}</InputLabel>
            <Select
              value={period}
              label={t("period.label")}
              onChange={(e) => setPeriod(e.target.value as Period)}
            >
              <MenuItem value="all">{t("period.all")}</MenuItem>
              <MenuItem value="last30">{t("period.last30")}</MenuItem>
              <MenuItem value="last90">{t("taskReport.last90")}</MenuItem>
              <MenuItem value="custom">{t("period.custom")}</MenuItem>
            </Select>
          </FormControl>

          {period === "custom" && (
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                label={t("period.from")}
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                label={t("period.to")}
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Stack>
          )}
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button
          variant="contained"
          startIcon={
            loading ? <CircularProgress size={18} color="inherit" /> : <VisibilityRounded />
          }
          disabled={loading || (period === "custom" && (!from || !to))}
          onClick={() => onPreview(buildParams())}
        >
          {t("taskReport.preview")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
