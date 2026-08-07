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
    // Se omiten las claves en "all" en vez de mandarlas y compararlas como
    // string en el handler.
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
      <DialogTitle>Reporte de tareas</DialogTitle>

      <DialogContent>
        <Stack spacing={3} sx={{ mt: 1 }}>
          <Alert severity="info" variant="outlined">
            El reporte incluye las tareas archivadas, que ya no aparecen en la pizarra.
          </Alert>

          <FormControl fullWidth>
            <InputLabel>Participante</InputLabel>
            <Select
              value={participant}
              label="Participante"
              onChange={(e) => setParticipant(e.target.value)}
            >
              <MenuItem value="all">Todos</MenuItem>
              {employees.map((employee) => (
                <MenuItem key={employee.id} value={String(employee.id)}>
                  #{employee.employeeNumber} - {employee.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl fullWidth>
            <InputLabel>Estado</InputLabel>
            <Select value={state} label="Estado" onChange={(e) => setState(e.target.value)}>
              <MenuItem value="all">Todos</MenuItem>
              {STATE_ORDER.map((value) => (
                <MenuItem key={value} value={value}>
                  {STATE_META[value].label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl fullWidth>
            <InputLabel>Período</InputLabel>
            <Select
              value={period}
              label="Período"
              onChange={(e) => setPeriod(e.target.value as Period)}
            >
              <MenuItem value="all">Todo el historial</MenuItem>
              <MenuItem value="last30">Últimos 30 días</MenuItem>
              <MenuItem value="last90">Últimos 90 días</MenuItem>
              <MenuItem value="custom">Rango personalizado</MenuItem>
            </Select>
          </FormControl>

          {period === "custom" && (
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                label="Desde"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                label="Hasta"
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
        <Button onClick={onClose}>Cancelar</Button>
        <Button
          variant="contained"
          startIcon={
            loading ? <CircularProgress size={18} color="inherit" /> : <VisibilityRounded />
          }
          disabled={loading || (period === "custom" && (!from || !to))}
          onClick={() => onPreview(buildParams())}
        >
          Previsualizar
        </Button>
      </DialogActions>
    </Dialog>
  );
}
