import {
  Box,
  Chip,
  FormControl,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import { formatRange } from "../tasks/datetime";
import { STATE_META, type TaskState } from "../tasks/types";

export type AssignableTask = {
  id: number;
  title: string;
  state: TaskState;
  startsAt: string;
  endsAt: string;
};

/** Valor del <Select> cuando se trabaja en algo que no está en la pizarra. */
export const NO_TASK = "none";

type Props = {
  tasks: AssignableTask[];
  loading: boolean;
  /** null = "Sin tarea"; un número = el id elegido. */
  value: number | null;
  onChange: (taskId: number | null) => void;
};

/**
 * Selector de la tarea que se declara al pasar a "Trabajando".
 *
 * La opción "Sin tarea" es deliberada y no un escape gratuito: sin ella, quien
 * participa de una tarea que arranca el mes que viene quedaría obligado a
 * imputarle el trabajo de hoy, y ese dato sucio contamina el resumen para
 * siempre. Elegirla exige comentario (lo controla el diálogo que lo contiene).
 */
export default function WorkingTaskSelect({ tasks, loading, value, onChange }: Props) {
  const empty = !loading && tasks.length === 0;

  return (
    <FormControl fullWidth disabled={loading || empty}>
      <InputLabel>{loading ? "Cargando tus tareas…" : "Tarea"}</InputLabel>
      <Select
        value={value === null ? NO_TASK : String(value)}
        label={loading ? "Cargando tus tareas…" : "Tarea"}
        onChange={(e) => onChange(e.target.value === NO_TASK ? null : Number(e.target.value))}
        renderValue={(selected) => {
          if (selected === NO_TASK) return "Sin tarea — otro trabajo";
          return tasks.find((task) => String(task.id) === selected)?.title ?? "Tarea";
        }}
      >
        <MenuItem value={NO_TASK}>Sin tarea — otro trabajo</MenuItem>
        {tasks.map((task) => (
          <MenuItem key={task.id} value={String(task.id)}>
            <Stack sx={{ py: 0.25 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <Typography sx={{ fontWeight: 600 }}>{task.title}</Typography>
                <Chip
                  size="small"
                  label={STATE_META[task.state].label}
                  sx={{
                    height: 18,
                    fontSize: 10,
                    fontWeight: 700,
                    bgcolor: STATE_META[task.state].soft,
                    color: STATE_META[task.state].ink,
                  }}
                />
              </Stack>
              <Typography variant="caption" color="text.secondary">
                {formatRange(task.startsAt, task.endsAt)}
              </Typography>
            </Stack>
          </MenuItem>
        ))}
      </Select>

      <FormHelperText component="div">
        {empty ? (
          <Box>No tenés tareas asignadas en la pizarra. Contá en el comentario en qué trabajás.</Box>
        ) : (
          <Box>Solo tus tareas sin terminar que siguen en la pizarra.</Box>
        )}
      </FormHelperText>
    </FormControl>
  );
}
